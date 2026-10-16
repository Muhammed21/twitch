import { randomUUID } from "node:crypto";
import { hostname } from "node:os";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createContextClient } from "@repo/db";

import { createApp } from "../../create-app.ts";
import { createRelayRedis, startOutboxRelay } from "../../outbox-relay/outbox-relay.ts";
import { toStreamEntry } from "../../platform/stream-entry.ts";

const urlOf = (variable: string): string => {
  const url = process.env[variable];
  if (url === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return url;
};

const prisma = createContextClient({ context: "channel", env: process.env });
const relayPool = new Pool({ connectionString: urlOf("DATABASE_URL_OUTBOX_RELAY") });
const relayRedis = createRelayRedis(urlOf("REDIS_URL"));

const withApiAndRelay = async (
  run: (base: string) => Promise<void>,
  logSink: (line: string) => void = () => {},
) => {
  const { app } = await createApp({ env: process.env, logSink });
  await app.listen(0, "127.0.0.1");
  const relay = startOutboxRelay({
    pool: relayPool,
    redis: relayRedis,
    outboxes: [{ schema: "identity", table: "IdentityOutbox" }],
    intervalMs: 20,
    onError: () => {},
  });
  try {
    await run(await app.getUrl());
  } finally {
    await relay.stop();
    await app.close();
  }
};

const signUp = (base: string, account: { name: string; email: string; password: string }) =>
  fetch(`${base}/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: urlOf("BETTER_AUTH_URL") },
    body: JSON.stringify({ ...account, birthDate: "2000-01-01" }),
  });

const accountIdOf = async (email: string) => {
  const identity = createContextClient({ context: "identity", env: process.env });
  try {
    return (await identity.identityUser.findUnique({ where: { email }, select: { id: true } }))?.id;
  } finally {
    await identity.$disconnect();
  }
};

beforeAll(async () => {
  await relayRedis.connect();
});

afterAll(async () => {
  relayRedis.destroy();
  await relayPool.end();
  await prisma.$disconnect();
});

describe("channel consomme events.identity (ADR 0034, ADR 0035)", () => {
  it("crée la chaîne d'un compte qui s'inscrit", async () => {
    const suffix = randomUUID().slice(0, 8);
    const account = {
      name: `Streameuse ${suffix}`,
      email: `channel-${randomUUID()}@twitch.local`,
      password: "un-mot-de-passe-solide-42",
    };

    await withApiAndRelay(async (base) => {
      expect((await signUp(base, account)).status).toBe(200);
      const accountId = await accountIdOf(account.email);

      await vi.waitFor(
        async () =>
          expect(await prisma.channel.findUnique({ where: { ownerId: accountId } })).toMatchObject({
            slug: `streameuse_${suffix}`,
          }),
        { timeout: 25_000, interval: 100 },
      );
    });
  });

  it("écarte un event sans nom d'affichage et continue avec les suivants", async () => {
    const stale = randomUUID();
    const suffix = randomUUID().slice(0, 8);
    const account = {
      name: `Apres Event Ancien ${suffix}`,
      email: `channel-${randomUUID()}@twitch.local`,
      password: "un-mot-de-passe-solide-42",
    };
    await relayRedis.xAdd(
      "events.identity",
      "*",
      toStreamEntry({
        id: randomUUID(),
        name: "identity.account.registered",
        version: 1,
        payload: { accountId: stale },
        occurredAt: new Date(),
      }),
    );

    await withApiAndRelay(async (base) => {
      await signUp(base, account);
      const accountId = await accountIdOf(account.email);

      await vi.waitFor(
        async () =>
          expect(await prisma.channel.findUnique({ where: { ownerId: accountId } })).not.toBeNull(),
        { timeout: 25_000, interval: 100 },
      );
    });

    expect(await prisma.channel.findUnique({ where: { ownerId: stale } })).toBeNull();
  });

  it("s'inscrit dans le groupe channel sous le nom <machine>-<pid>", async () => {
    const consumer = `${hostname()}-${process.pid}`;
    await relayRedis.xGroupDelConsumer("events.identity", "channel", consumer).catch(() => 0);

    await withApiAndRelay(async () => {
      await vi.waitFor(
        async () =>
          expect(await relayRedis.xInfoConsumers("events.identity", "channel")).toContainEqual(
            expect.objectContaining({ name: consumer }),
          ),
        { timeout: 10_000, interval: 100 },
      );
    });
  });

  it("journalise une entrée illisible de events.identity", async () => {
    const lines: string[] = [];
    const entryId = await relayRedis.xAdd("events.identity", "*", { name: "sans le reste" });

    await withApiAndRelay(
      async () => {
        await vi.waitFor(
          () =>
            expect(lines.map((line) => JSON.parse(line))).toContainEqual(
              expect.objectContaining({
                level: "error",
                msg: "consommation de stream en échec",
                stream: "events.identity",
                entryId,
                error: "entrée illisible",
              }),
            ),
          { timeout: 25_000, interval: 100 },
        );
      },
      (line) => lines.push(line),
    );
  });

  it("ferme ses connexions Redis de channel à l'arrêt de l'API", async () => {
    const channelClients = [
      expect.objectContaining({ name: "api-authz" }),
      expect.objectContaining({ name: "api-stream-consumer" }),
    ];

    await withApiAndRelay(async () => {
      await vi.waitFor(async () =>
        expect(await relayRedis.clientList()).toEqual(expect.arrayContaining(channelClients)),
      );
    });

    await vi.waitFor(async () => {
      const names = (await relayRedis.clientList()).map((client) => client.name);
      expect(names).not.toContain("api-authz");
      expect(names).not.toContain("api-stream-consumer");
    });
  });
});
