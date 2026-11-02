import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";

import { Test } from "@nestjs/testing";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createContextClient } from "@repo/db";

import { createAuthzRedis } from "../../authz/authz-context.ts";
import { createApp } from "../../create-app.ts";
import { createStreamConsumerRedis } from "../../platform/stream-consumer.ts";
import { toStreamEntry } from "../../platform/stream-entry.ts";
import { DiscoveryModule } from "./discovery.module.ts";

const urlOf = (variable: string): string => {
  const url = process.env[variable];
  if (url === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return url;
};

const discovery = createContextClient({ context: "discovery", env: process.env });

const publisher = createAuthzRedis(urlOf("REDIS_URL"));

const publish = (
  stream: "events.channel" | "events.stream",
  {
    id = randomUUID(),
    name,
    payload,
    occurredAt = new Date(),
  }: {
    id?: string;
    name: string;
    payload: Readonly<Record<string, string>>;
    occurredAt?: Date;
  },
) => publisher.xAdd(stream, "*", toStreamEntry({ id, name, version: 1, payload, occurredAt }));

const channelCreated = (channelId: string, slug: string) =>
  publish("events.channel", {
    name: "channel.created",
    payload: { channelId, ownerId: randomUUID(), slug },
  });

const titleChanged = (
  channelId: string,
  title: string,
  { id, occurredAt }: { id?: string; occurredAt?: Date } = {},
) =>
  publish("events.channel", {
    id,
    occurredAt,
    name: "channel.metadata.updated",
    payload: { channelId, title },
  });

const streamStarted = (channelId: string, sessionId: string, startedAt: Date) =>
  publish("events.stream", {
    name: "stream.started",
    payload: { sessionId, channelId, startedAt: startedAt.toISOString() },
  });

const streamEnded = (channelId: string, sessionId: string, endedAt: Date) =>
  publish("events.stream", {
    name: "stream.ended",
    payload: { sessionId, channelId, endedAt: endedAt.toISOString() },
  });

const viewOf = (channelId: string) =>
  discovery.discoveryLiveChannelView.findUnique({ where: { channelId } });

const eventually = (assertion: () => Promise<void>) =>
  vi.waitFor(assertion, { timeout: 20_000, interval: 100 });

type ConsumerRedis = ReturnType<typeof createStreamConsumerRedis>;

const withDiscoveryModule = async (
  run: (logs: string[], consumerRedis: readonly ConsumerRedis[]) => Promise<void>,
) => {
  const logs: string[] = [];
  const channelConsumerRedis = createStreamConsumerRedis(urlOf("REDIS_URL"));
  const streamConsumerRedis = createStreamConsumerRedis(urlOf("REDIS_URL"));
  await Promise.all([channelConsumerRedis.connect(), streamConsumerRedis.connect()]);
  const moduleRef = await Test.createTestingModule({
    imports: [
      DiscoveryModule.register({
        prisma: createContextClient({ context: "discovery", env: process.env }),
        channelConsumerRedis,
        streamConsumerRedis,
        logSink: (line) => logs.push(line),
      }),
    ],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  try {
    await run(logs, [channelConsumerRedis, streamConsumerRedis]);
  } finally {
    await app.close();
  }
};

const withMigrator = async <T>(query: (client: Client) => Promise<T>): Promise<T> => {
  const client = new Client({ connectionString: urlOf("DATABASE_URL_MIGRATOR") });
  await client.connect();
  try {
    return await query(client);
  } finally {
    await client.end();
  }
};

const openDiscoveryConnections = () =>
  withMigrator(async (client) => {
    const { rows } = await client.query<{ open: string }>(
      "SELECT count(*) AS open FROM pg_stat_activity WHERE usename = 'app_discovery'",
    );
    return Number(rows[0]?.open);
  });

const slugFor = () => `live_${randomUUID().replaceAll("-", "").slice(0, 12)}`;

beforeAll(async () => {
  await publisher.connect();
});

afterAll(async () => {
  publisher.destroy();
  await discovery.$disconnect();
});

describe("projection LiveChannelView de discovery (ADR 0003, §6)", () => {
  it("met en live une chaîne créée dont une session démarre, avec son slug et son titre", async () => {
    const channelId = randomUUID();
    const sessionId = randomUUID();
    const slug = slugFor();
    const startedAt = new Date("2026-11-02T20:00:00.000Z");

    await withDiscoveryModule(async () => {
      await channelCreated(channelId, slug);
      await titleChanged(channelId, "Speedrun");
      await streamStarted(channelId, sessionId, startedAt);

      await eventually(async () =>
        expect(await viewOf(channelId)).toEqual({
          channelId,
          slug,
          title: "Speedrun",
          titleChangedAt: expect.any(Date),
          liveSessionId: sessionId,
          liveStartedAt: startedAt,
          lastEndedAt: null,
        }),
      );
    });
  });

  it("sort du live une chaîne dont la session se termine", async () => {
    const channelId = randomUUID();
    const sessionId = randomUUID();
    const endedAt = new Date("2026-11-02T21:00:00.000Z");

    await withDiscoveryModule(async () => {
      await channelCreated(channelId, slugFor());
      await streamStarted(channelId, sessionId, new Date("2026-11-02T20:00:00.000Z"));
      await streamEnded(channelId, sessionId, endedAt);

      await eventually(async () =>
        expect(await viewOf(channelId)).toMatchObject({
          liveSessionId: null,
          liveStartedAt: null,
          lastEndedAt: endedAt,
        }),
      );
    });
  });

  it("met en live une chaîne dont le démarrage arrive avant la création", async () => {
    const channelId = randomUUID();
    const sessionId = randomUUID();
    const slug = slugFor();

    await withDiscoveryModule(async () => {
      await streamStarted(channelId, sessionId, new Date("2026-11-02T20:00:00.000Z"));
      await eventually(async () =>
        expect(await viewOf(channelId)).toMatchObject({ slug: null, liveSessionId: sessionId }),
      );

      await channelCreated(channelId, slug);

      await eventually(async () =>
        expect(await viewOf(channelId)).toMatchObject({ slug, liveSessionId: sessionId }),
      );
    });
  });

  it("ignore un event rejoué : le titre reste celui du dernier event nouveau", async () => {
    const channelId = randomUUID();
    const firstTitleEvent = randomUUID();

    await withDiscoveryModule(async () => {
      await titleChanged(channelId, "Ancien titre", { id: firstTitleEvent });
      await titleChanged(channelId, "Nouveau titre");
      await titleChanged(channelId, "Ancien titre", { id: firstTitleEvent });
      await channelCreated(channelId, slugFor());

      await eventually(async () =>
        expect(await viewOf(channelId)).toMatchObject({ slug: expect.any(String) }),
      );
      expect(await viewOf(channelId)).toMatchObject({ title: "Nouveau titre" });
    });
  });

  it("garde le titre le plus récent quand un changement plus ancien arrive après", async () => {
    const channelId = randomUUID();

    await withDiscoveryModule(async () => {
      await titleChanged(channelId, "Nouveau titre", {
        occurredAt: new Date("2026-11-02T20:05:00.000Z"),
      });
      await titleChanged(channelId, "Ancien titre", {
        occurredAt: new Date("2026-11-02T20:00:00.000Z"),
      });
      await channelCreated(channelId, slugFor());

      await eventually(async () =>
        expect(await viewOf(channelId)).toMatchObject({ slug: expect.any(String) }),
      );
      expect(await viewOf(channelId)).toMatchObject({
        title: "Nouveau titre",
        titleChangedAt: new Date("2026-11-02T20:05:00.000Z"),
      });
    });
  });

  it("acquitte et journalise un event hors contrat, sans rien projeter", async () => {
    const channelId = randomUUID();
    const eventId = randomUUID();

    await withDiscoveryModule(async (logs) => {
      await publish("events.stream", {
        id: eventId,
        name: "stream.started",
        payload: { channelId },
      });

      await eventually(async () =>
        expect(logs.map((line) => JSON.parse(line))).toContainEqual(
          expect.objectContaining({ msg: "event écarté : payload hors contrat", eventId }),
        ),
      );
      expect(await viewOf(channelId)).toBeNull();
    });
  });

  it("consomme events.channel et events.stream dans le groupe discovery", async () => {
    await withDiscoveryModule(async () => {
      await eventually(async () => {
        const groups = await Promise.all(
          ["events.channel", "events.stream"].map((stream) => publisher.xInfoGroups(stream)),
        );
        expect(groups.map((list) => list.map(({ name }) => name))).toEqual([
          expect.arrayContaining(["discovery"]),
          expect.arrayContaining(["discovery"]),
        ]);
      });
    });
  });

  it("projette les lives dès que l'API démarre", async () => {
    const channelId = randomUUID();
    const sessionId = randomUUID();
    const { app } = await createApp({ env: process.env, logSink: () => {} });
    await app.init();
    try {
      await streamStarted(channelId, sessionId, new Date("2026-11-02T20:00:00.000Z"));

      await eventually(async () =>
        expect(await viewOf(channelId)).toMatchObject({ liveSessionId: sessionId }),
      );
    } finally {
      await app.close();
    }
  });

  it("journalise une entrée illisible de events.channel", async () => {
    const entryId = await publisher.xAdd("events.channel", "*", { name: "sans le reste" });

    await withDiscoveryModule(async (logs) => {
      await eventually(async () =>
        expect(logs.map((line) => JSON.parse(line))).toContainEqual(
          expect.objectContaining({
            level: "error",
            msg: "consommation de stream en échec",
            stream: "events.channel",
            entryId,
            error: "entrée illisible",
          }),
        ),
      );
    });
  });

  it("s'inscrit dans le groupe discovery sous le nom <machine>-<pid>", async () => {
    const consumer = `${hostname()}-${process.pid}`;
    const streams = ["events.channel", "events.stream"];
    await Promise.all(
      streams.map((stream) =>
        publisher.xGroupDelConsumer(stream, "discovery", consumer).catch(() => 0),
      ),
    );

    await withDiscoveryModule(async () => {
      await eventually(async () => {
        const consumers = await Promise.all(
          streams.map((stream) => publisher.xInfoConsumers(stream, "discovery")),
        );
        expect(consumers).toEqual([
          expect.arrayContaining([expect.objectContaining({ name: consumer })]),
          expect.arrayContaining([expect.objectContaining({ name: consumer })]),
        ]);
      });
    });
  });

  it("arrête ses consommateurs avant de fermer Redis, sans échec journalisé ensuite", async () => {
    const kept: string[][] = [];

    await withDiscoveryModule(async (logs) => {
      kept.push(logs);
      await eventually(async () =>
        expect(await publisher.xInfoConsumers("events.stream", "discovery")).not.toEqual([]),
      );
    });
    await sleep(1500);

    expect(kept.flat().join("\n")).not.toContain("consommation de stream en échec");
  });

  it("s'arrête sans erreur quand une connexion Redis est déjà fermée", async () => {
    await expect(
      withDiscoveryModule(async (_, [channelConsumerRedis]) => {
        channelConsumerRedis?.destroy();
      }),
    ).resolves.toBeUndefined();
  });

  it("ferme ses connexions à la base et à Redis à l'arrêt", async () => {
    const channelId = randomUUID();
    const sessionId = randomUUID();
    await discovery.$queryRaw`SELECT 1`;
    const before = await openDiscoveryConnections();
    const closed: ConsumerRedis[] = [];

    await withDiscoveryModule(async (_, consumerRedis) => {
      closed.push(...consumerRedis);
      await streamStarted(channelId, sessionId, new Date("2026-11-02T20:00:00.000Z"));
      await eventually(async () =>
        expect(await viewOf(channelId)).toMatchObject({ liveSessionId: sessionId }),
      );
      expect(await openDiscoveryConnections()).toBeGreaterThan(before);
    });

    expect(await openDiscoveryConnections()).toBe(before);
    expect(closed.map((redis) => redis.isOpen)).toEqual([false, false]);
  });
});
