import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";

import { Test } from "@nestjs/testing";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createContextClient } from "@repo/db";

import { createAuthzRedis } from "../../authz/authz-context.ts";
import { createApp } from "../../create-app.ts";
import { rejectingVerifier } from "../../platform/authentication.ts";
import { PlatformModule } from "../../platform/platform.module.ts";
import { createStreamConsumerRedis } from "../../platform/stream-consumer.ts";
import { toStreamEntry } from "../../platform/stream-entry.ts";
import type { ChannelLiveStatus, LiveStatusHub } from "./application/live-status-hub.ts";
import type { ViewerCountReader } from "./application/live-status-viewers.ts";
import { DiscoveryModule, rebuildDiscoveryProjection } from "./discovery.module.ts";
import {
  prismaLiveChannelProjection,
  prismaLiveChannelStore,
} from "./infrastructure/prisma-live-channel-projection.ts";
import { LIVE_STATUS_HUB } from "./presentation/live-status.controller.ts";

const urlOf = (variable: string): string => {
  const url = process.env[variable];
  if (url === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return url;
};

const discovery = createContextClient({ context: "discovery", env: process.env });
const channelDb = createContextClient({ context: "channel", env: process.env });
const streamDb = createContextClient({ context: "stream", env: process.env });
const outboxPool = new Pool({ connectionString: urlOf("DATABASE_URL_PROJECTION_REBUILD") });

type OutboxEvent = {
  id: string;
  name: string;
  payload: Readonly<Record<string, string | readonly string[]>>;
  occurredAt: Date;
};

const appendToHistory = async (
  outbox: "channel" | "stream",
  { id, name, payload, occurredAt }: OutboxEvent,
) => {
  const row = { id, name, version: 1, payload, occurredAt, publishedAt: new Date() };
  return outbox === "channel"
    ? channelDb.channelOutbox.create({ data: row })
    : streamDb.streamOutbox.create({ data: row });
};

const rebuild = () =>
  rebuildDiscoveryProjection({
    pool: outboxPool,
    prisma: createContextClient({ context: "discovery", env: process.env }),
  });
const publisher = createAuthzRedis(urlOf("REDIS_URL"));

const publish = (
  stream: "events.channel" | "events.stream" | "events.identity",
  {
    id = randomUUID(),
    name,
    payload,
    occurredAt = new Date(),
  }: {
    id?: string;
    name: string;
    payload: Readonly<Record<string, string | readonly string[]>>;
    occurredAt?: Date;
  },
) => publisher.xAdd(stream, "*", toStreamEntry({ id, name, version: 1, payload, occurredAt }));

const channelCreated = (channelId: string, slug: string, ownerId: string = randomUUID()) =>
  publish("events.channel", {
    name: "channel.created",
    payload: { channelId, ownerId, slug },
  });

const avatarChanged = (accountId: string, avatarKey: string, occurredAt: Date) =>
  publish("events.identity", {
    occurredAt,
    name: "identity.avatar.changed",
    payload: { accountId, avatarKey },
  });

const avatarOf = (accountId: string) =>
  discovery.discoveryAccountAvatar.findUnique({ where: { accountId } });

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
  run: (
    logs: string[],
    consumerRedis: readonly ConsumerRedis[],
    hub: LiveStatusHub,
  ) => Promise<void>,
  { viewerCounts = async () => new Map() }: { viewerCounts?: ViewerCountReader } = {},
) => {
  const logs: string[] = [];
  const channelConsumerRedis = createStreamConsumerRedis(urlOf("REDIS_URL"));
  const streamConsumerRedis = createStreamConsumerRedis(urlOf("REDIS_URL"));
  const identityConsumerRedis = createStreamConsumerRedis(urlOf("REDIS_URL"));
  await Promise.all([
    channelConsumerRedis.connect(),
    streamConsumerRedis.connect(),
    identityConsumerRedis.connect(),
  ]);
  const moduleRef = await Test.createTestingModule({
    imports: [
      PlatformModule.register({
        schemaVersionCheck: async () => {},
        logSink: () => {},
        accessTokenVerifier: rejectingVerifier,
      }),
      DiscoveryModule.register({
        prisma: createContextClient({ context: "discovery", env: process.env }),
        channelConsumerRedis,
        streamConsumerRedis,
        identityConsumerRedis,
        viewerCounts,
        thumbnailUrls: async () => new Map(),
        logSink: (line) => logs.push(line),
        images: { imageUrlOf: (key) => `https://images.test/${key}` },
      }),
    ],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  try {
    await run(
      logs,
      [channelConsumerRedis, streamConsumerRedis, identityConsumerRedis],
      app.get(LIVE_STATUS_HUB),
    );
  } finally {
    await app.close();
  }
};

const makeSignal = () => {
  const resolvers: (() => void)[] = [];
  const promise = new Promise<void>((resolve) => {
    resolvers.push(resolve);
  });
  return { promise, resolve: () => resolvers.forEach((resolve) => resolve()) };
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

const blockedOnProjection = () =>
  withMigrator(async (client) => {
    const { rows } = await client.query<{ waiting: string }>(
      `SELECT count(*) AS waiting FROM pg_locks
       WHERE relation IN (
         '"discovery"."DiscoveryLiveChannelView"'::regclass,
         '"discovery"."DiscoveryProcessedEvent"'::regclass
       ) AND NOT granted`,
    );
    return Number(rows[0]?.waiting);
  });

const slugFor = () => `live_${randomUUID().replaceAll("-", "").slice(0, 12)}`;

beforeAll(async () => {
  await publisher.connect();
});

afterAll(async () => {
  publisher.destroy();
  await outboxPool.end();
  await Promise.all([discovery.$disconnect(), channelDb.$disconnect(), streamDb.$disconnect()]);
});

describe("projection LiveChannelView de discovery (ADR 0003, §6)", () => {
  it("met en live une chaîne créée dont une session démarre, avec son slug, son propriétaire et son titre", async () => {
    const channelId = randomUUID();
    const ownerId = randomUUID();
    const sessionId = randomUUID();
    const slug = slugFor();
    const startedAt = new Date("2026-11-02T20:00:00.000Z");

    await withDiscoveryModule(async () => {
      await channelCreated(channelId, slug, ownerId);
      await titleChanged(channelId, "Speedrun");
      await streamStarted(channelId, sessionId, startedAt);

      await eventually(async () =>
        expect(await viewOf(channelId)).toEqual({
          channelId,
          slug,
          ownerId,
          title: "Speedrun",
          titleChangedAt: expect.any(Date),
          categoryId: null,
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
      const ancien = { id: firstTitleEvent, occurredAt: new Date("2026-11-02T20:00:00.000Z") };
      await titleChanged(channelId, "Ancien titre", ancien);
      await titleChanged(channelId, "Nouveau titre", {
        occurredAt: new Date("2026-11-02T20:05:00.000Z"),
      });
      await titleChanged(channelId, "Ancien titre", ancien);
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

  it("garde l'avatar le plus récent d'un compte quand un plus ancien arrive après lui", async () => {
    const accountId = randomUUID();
    const recent = {
      avatarKey: "images/avatar/recent.webp",
      changedAt: new Date("2026-11-05T10:05:00.000Z"),
    };

    const afterReplay = randomUUID();

    await withDiscoveryModule(async () => {
      await avatarChanged(accountId, recent.avatarKey, recent.changedAt);
      await avatarChanged(
        accountId,
        "images/avatar/ancien.webp",
        new Date("2026-11-05T10:00:00.000Z"),
      );
      await avatarChanged(afterReplay, "images/avatar/suivant.webp", recent.changedAt);
      await eventually(async () => expect(await avatarOf(afterReplay)).not.toBeNull());

      expect(await avatarOf(accountId)).toEqual({ accountId, ...recent });
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

  it("consomme events.channel, events.stream et events.identity dans le groupe discovery", async () => {
    await withDiscoveryModule(async () => {
      await eventually(async () => {
        const groups = await Promise.all(
          ["events.channel", "events.stream", "events.identity"].map((stream) =>
            publisher.xInfoGroups(stream),
          ),
        );
        expect(groups.map((list) => list.map(({ name }) => name))).toEqual([
          expect.arrayContaining(["discovery"]),
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
    expect(closed.map((redis) => redis.isOpen)).toEqual([false, false, false]);
  });
});

describe("statut des lives de discovery quand Redis présence est en panne (ADR 0004 §2)", () => {
  it("envoie l'état du live sans nombre de viewers, et journalise l'échec", async () => {
    const channelId = randomUUID();
    const startedAt = new Date("2026-11-03T20:00:00.000Z");
    await discovery.discoveryLiveChannelView.create({
      data: {
        channelId,
        slug: `panne_${randomUUID().replaceAll("-", "").slice(0, 12)}`,
        title: "Panne",
        liveSessionId: randomUUID(),
        liveStartedAt: startedAt,
      },
    });
    const received: ChannelLiveStatus[] = [];
    try {
      await withDiscoveryModule(
        async (logs, _, hub) => {
          const subscription = await hub.subscribe(channelId, (status) => received.push(status));

          expect(subscription.ok).toBe(true);
          expect(received).toEqual([{ channelId, startedAt }]);
          expect(logs.map((line) => JSON.parse(line) as Record<string, unknown>)).toContainEqual(
            expect.objectContaining({
              level: "error",
              msg: "lecture du nombre de viewers en échec",
              error: "Redis présence injoignable",
            }),
          );
        },
        {
          viewerCounts: async () => {
            throw new Error("Redis présence injoignable");
          },
        },
      );
    } finally {
      await discovery.discoveryLiveChannelView.delete({ where: { channelId } });
    }
  });
});

describe("reconstruction de la projection depuis les outbox (ADR 0003, ADR 0034)", () => {
  it("redonne la vue que les consommateurs ont construite", async () => {
    const channelId = randomUUID();
    const sessionId = randomUUID();
    const history: readonly ["channel" | "stream", OutboxEvent][] = [
      [
        "channel",
        {
          id: randomUUID(),
          occurredAt: new Date(),
          name: "channel.created",
          payload: { channelId, ownerId: randomUUID(), slug: slugFor() },
        },
      ],
      [
        "channel",
        {
          id: randomUUID(),
          occurredAt: new Date(),
          name: "channel.metadata.updated",
          payload: { channelId, title: "Speedrun" },
        },
      ],
      [
        "stream",
        {
          id: randomUUID(),
          occurredAt: new Date(),
          name: "stream.started",
          payload: { sessionId, channelId, startedAt: "2026-11-02T20:00:00.000Z" },
        },
      ],
    ];
    for (const [outbox, event] of history) {
      await appendToHistory(outbox, event);
    }
    await withDiscoveryModule(async () => {
      for (const [outbox, event] of history) {
        await publish(`events.${outbox}`, event);
      }
      await eventually(async () =>
        expect(await viewOf(channelId)).toMatchObject({
          liveSessionId: sessionId,
          title: "Speedrun",
        }),
      );
    });
    const built = await viewOf(channelId);

    const report = await rebuild();

    expect(await viewOf(channelId)).toEqual(built);
    expect(report.events).toBeGreaterThanOrEqual(history.length);
  });

  it("projette les catégories, leur pochette et la catégorie d'une chaîne, puis les reconstruit à l'identique", async () => {
    const channelId = randomUUID();
    const sourceId = randomUUID();
    const targetId = randomUUID();
    const suffix = randomUUID().slice(0, 8);
    const history: readonly OutboxEvent[] = [
      {
        id: randomUUID(),
        occurredAt: new Date(),
        name: "channel.category.created",
        payload: { categoryId: sourceId, slug: `source-${suffix}`, name: "Source" },
      },
      {
        id: randomUUID(),
        occurredAt: new Date(),
        name: "channel.category.created",
        payload: { categoryId: targetId, slug: `cible-${suffix}`, name: "Cible" },
      },
      {
        id: randomUUID(),
        occurredAt: new Date(),
        name: "channel.category.updated",
        payload: {
          categoryId: targetId,
          name: "Cible",
          imageKey: "images/category/cible.webp",
          tags: ["Shooter"],
        },
      },
      {
        id: randomUUID(),
        occurredAt: new Date(),
        name: "channel.metadata.updated",
        payload: { channelId, title: "Speedrun", categoryId: sourceId },
      },
      {
        id: randomUUID(),
        occurredAt: new Date(),
        name: "channel.category.merged",
        payload: { sourceCategoryId: sourceId, targetCategoryId: targetId },
      },
    ];
    for (const event of history) {
      await appendToHistory("channel", event);
    }
    const categoryViews = () =>
      discovery.discoveryCategoryView.findMany({
        where: { categoryId: { in: [sourceId, targetId] } },
        orderBy: { name: "asc" },
      });
    await withDiscoveryModule(async () => {
      for (const event of history) {
        await publish("events.channel", event);
      }
      await eventually(async () =>
        expect(await categoryViews()).toEqual([
          {
            categoryId: targetId,
            slug: `cible-${suffix}`,
            name: "Cible",
            status: "active",
            mergedIntoId: null,
            imageKey: "images/category/cible.webp",
            tags: ["Shooter"],
          },
          {
            categoryId: sourceId,
            slug: `source-${suffix}`,
            name: "Source",
            status: "merged",
            mergedIntoId: targetId,
            imageKey: null,
            tags: [],
          },
        ]),
      );
      await eventually(async () =>
        expect(await viewOf(channelId)).toMatchObject({ categoryId: sourceId }),
      );
    });
    const built = { channel: await viewOf(channelId), categories: await categoryViews() };

    await rebuild();

    expect({ channel: await viewOf(channelId), categories: await categoryViews() }).toEqual(built);
  });

  it("garde les avatars des comptes, qu'aucune outbox reconstruite ne décrit", async () => {
    const accountId = randomUUID();
    const avatar = {
      accountId,
      avatarKey: "images/avatar/garde.webp",
      changedAt: new Date("2026-11-05T10:00:00.000Z"),
    };
    await discovery.discoveryAccountAvatar.create({ data: avatar });

    await rebuild();

    expect(await avatarOf(accountId)).toEqual(avatar);
  });

  it("retire une chaîne qu'aucun event des outbox ne décrit", async () => {
    const channelId = randomUUID();
    await discovery.discoveryLiveChannelView.create({ data: { channelId, slug: slugFor() } });

    await rebuild();

    expect(await viewOf(channelId)).toBeNull();
  });

  it("marque traités les events repris, pour qu'un consommateur ne les rejoue pas", async () => {
    const title: OutboxEvent = {
      id: randomUUID(),
      occurredAt: new Date("2026-11-02T20:00:00.000Z"),
      name: "channel.metadata.updated",
      payload: { channelId: randomUUID(), title: "Titre repris" },
    };
    await appendToHistory("channel", title);

    await rebuild();

    expect(
      await discovery.discoveryProcessedEvent.findMany({
        where: { eventId: title.id },
        select: { handlerName: true },
      }),
    ).toEqual([{ handlerName: "discovery.live-channel-view" }]);
  });

  it("reconstruit plus de chaînes qu'un seul lot d'insertion n'en contient", async () => {
    const channelIds = Array.from({ length: 1001 }, () => randomUUID());
    await channelDb.channelOutbox.createMany({
      data: channelIds.map((channelId) => ({
        id: randomUUID(),
        name: "channel.created",
        version: 1,
        payload: { channelId, ownerId: randomUUID(), slug: slugFor() },
        occurredAt: new Date(),
        publishedAt: new Date(),
      })),
    });

    await rebuild();

    expect(
      await discovery.discoveryLiveChannelView.count({ where: { channelId: { in: channelIds } } }),
    ).toBe(channelIds.length);
  });

  it("fait attendre la fin de la reconstruction à un event consommé pendant celle-ci", async () => {
    const channelId = randomUUID();
    const prisma = createContextClient({ context: "discovery", env: process.env });
    const computing = makeSignal();
    const release = makeSignal();
    const rebuilding = prismaLiveChannelStore(prisma).replaceAll(async () => {
      computing.resolve();
      await release.promise;
      return {
        views: [
          {
            channelId,
            slug: null,
            ownerId: null,
            title: "Reconstruit",
            titleChangedAt: null,
            categoryId: null,
            live: null,
            lastEndedAt: null,
          },
        ],
        categories: [],
        follows: [],
        eventIds: [],
        skipped: 0,
      };
    });
    await computing.promise;
    const settled: string[] = [];
    const consuming = prismaLiveChannelProjection(discovery)
      .update({
        eventId: randomUUID(),
        channelId,
        change: (view) => ({ ...view, title: "Consommé" }),
      })
      .then(() => settled.push("update"));

    try {
      await eventually(async () => expect(await blockedOnProjection()).toBeGreaterThan(0));
      expect(settled).toEqual([]);
    } finally {
      release.resolve();
      await Promise.all([rebuilding, consuming]);
      await prisma.$disconnect();
    }

    expect(await viewOf(channelId)).toMatchObject({ title: "Consommé" });
  });
});
