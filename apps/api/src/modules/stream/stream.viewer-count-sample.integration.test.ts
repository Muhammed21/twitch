import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createContextClient } from "@repo/db";

import { createAuthzRedis } from "../../authz/authz-context.ts";
import { rejectingVerifier } from "../../platform/authentication.ts";
import { PlatformModule } from "../../platform/platform.module.ts";
import { createStreamConsumerRedis } from "../../platform/stream-consumer.ts";
import { sampleViewerCounts } from "./application/sample-viewer-counts.ts";
import {
  prismaOpenSessionPages,
  prismaViewerCountSamples,
} from "./infrastructure/prisma-viewer-count-samples.ts";
import { redisPresenceStore } from "./infrastructure/redis-presence-store.ts";
import { createPresenceRedis, StreamModule, viewerCountSampleDelayMs } from "./stream.module.ts";

const urlOf = (variable: string): string => {
  const url = process.env[variable];
  if (url === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return url;
};

const prisma = createContextClient({ context: "stream", env: process.env });
const presenceRedis = createPresenceRedis(urlOf("REDIS_URL"));
const presence = redisPresenceStore(presenceRedis);

const WINDOW_MS = 30_000;
const windowStart = (index: number) => new Date(Date.UTC(2099, 0, 1) + index * WINDOW_MS);

const seededSessions: string[] = [];

const seedSession = async ({ ended = false }: { ended?: boolean } = {}) => {
  const session = {
    id: randomUUID(),
    channelId: randomUUID(),
    providerSessionId: `session-${randomUUID()}`,
    startedAt: new Date(),
    ...(ended ? { endedAt: new Date() } : {}),
  };
  await prisma.streamSession.create({ data: session });
  seededSessions.push(session.id);
  return { sessionId: session.id, channelId: session.channelId };
};

const watch = (channelId: string, at: Date, viewers = 1) =>
  Promise.all(
    Array.from({ length: viewers }, () =>
      presence.record({ channelId, viewerId: randomUUID(), at }),
    ),
  );

const samplesOf = (sessionIds: readonly string[]) =>
  prisma.streamViewerCountSample.findMany({
    where: { sessionId: { in: [...sessionIds] } },
    select: { sessionId: true, sampledAt: true, viewerCount: true },
    orderBy: { sampledAt: "asc" },
  });

const sample = ({ pageSize }: { pageSize?: number } = {}) =>
  sampleViewerCounts({
    sessions: prismaOpenSessionPages({ prisma, ...(pageSize === undefined ? {} : { pageSize }) }),
    presence,
    samples: prismaViewerCountSamples(prisma),
  });

beforeAll(async () => {
  await presenceRedis.connect();
});

afterAll(async () => {
  await prisma.streamViewerCountSample.deleteMany({ where: { sessionId: { in: seededSessions } } });
  await prisma.streamSession.deleteMany({ where: { id: { in: seededSessions } } });
  presenceRedis.destroy();
  await prisma.$disconnect();
});

describe("échantillons du compteur de viewers en base (ADR 0004 §3)", () => {
  it("écrit pour chaque session ouverte le compteur de Redis, zéro compris, et rien pour une session terminée", async () => {
    const watched = await seedSession();
    const empty = await seedSession();
    const ended = await seedSession({ ended: true });
    const now = new Date(windowStart(10).getTime() + 12_000);
    await watch(watched.channelId, now, 3);
    await watch(ended.channelId, now);

    await sample()(now);

    expect(await samplesOf([watched.sessionId, empty.sessionId, ended.sessionId])).toEqual(
      expect.arrayContaining([
        { sessionId: watched.sessionId, sampledAt: windowStart(10), viewerCount: 3 },
        { sessionId: empty.sessionId, sampledAt: windowStart(10), viewerCount: 0 },
      ]),
    );
    expect(await samplesOf([ended.sessionId])).toEqual([]);
    expect(await samplesOf([watched.sessionId, empty.sessionId])).toHaveLength(2);
  });

  it("garde le premier échantillon d'une fenêtre quand un second arrive dans la même", async () => {
    const session = await seedSession();
    await watch(session.channelId, new Date(windowStart(20).getTime() + 1000), 2);

    await sample()(new Date(windowStart(20).getTime() + 1000));
    await watch(session.channelId, new Date(windowStart(20).getTime() + 2000), 5);
    await sample()(new Date(windowStart(20).getTime() + 29_999));

    expect(await samplesOf([session.sessionId])).toEqual([
      { sessionId: session.sessionId, sampledAt: windowStart(20), viewerCount: 2 },
    ]);
  });

  it("écrit un nouvel échantillon à la fenêtre suivante", async () => {
    const session = await seedSession();

    await sample()(windowStart(30));
    await sample()(windowStart(31));

    expect((await samplesOf([session.sessionId])).map(({ sampledAt }) => sampledAt)).toEqual([
      windowStart(30),
      windowStart(31),
    ]);
  });

  it("échantillonne les sessions de toutes les pages", async () => {
    const sessions = await Promise.all([seedSession(), seedSession(), seedSession()]);

    await sample({ pageSize: 2 })(windowStart(40));

    expect(await samplesOf(sessions.map(({ sessionId }) => sessionId))).toHaveLength(3);
  });

  it("ne publie aucun event", async () => {
    const session = await seedSession();

    await sample()(windowStart(50));

    expect(
      await prisma.streamOutbox.count({
        where: { payload: { path: ["sessionId"], equals: session.sessionId } },
      }),
    ).toBe(0);
  });
});

const TEST_INTERVAL_MS = 20;

const eventually = async (check: () => Promise<boolean> | boolean) => {
  const deadline = Date.now() + 5000;
  while (!(await check())) {
    if (Date.now() > deadline) {
      throw new Error("condition jamais remplie");
    }
    await sleep(TEST_INTERVAL_MS);
  }
};

const withStreamModule = async (
  { connectPresence }: { connectPresence: boolean },
  run: (logs: readonly Record<string, unknown>[]) => Promise<void>,
) => {
  const logs: Record<string, unknown>[] = [];
  const authzRedis = createAuthzRedis(urlOf("REDIS_URL"));
  const consumerRedis = createStreamConsumerRedis(urlOf("REDIS_URL"));
  const modulePresenceRedis = createPresenceRedis(urlOf("REDIS_URL"));
  await Promise.all([
    authzRedis.connect(),
    consumerRedis.connect(),
    ...(connectPresence ? [modulePresenceRedis.connect()] : []),
  ]);
  const logSink = (line: string) => {
    logs.push(JSON.parse(line) as Record<string, unknown>);
  };
  const context = await Test.createTestingModule({
    imports: [
      PlatformModule.register({
        schemaVersionCheck: async () => {},
        logSink,
        accessTokenVerifier: rejectingVerifier,
      }),
      StreamModule.register({
        prisma: createContextClient({ context: "stream", env: process.env }),
        webhookSecret: "secret-de-test",
        playbackBaseUrl: "http://127.0.0.1:3002",
        video: { provider: "fake" },
        authzRedis,
        consumerRedis,
        presenceRedis: modulePresenceRedis,
        logSink,
        viewerCountSampleIntervalMs: TEST_INTERVAL_MS,
      }),
    ],
  }).compile();
  await context.init();
  try {
    await run(logs);
  } finally {
    await context.close();
    authzRedis.destroy();
  }
};

describe("échantillonnage périodique du module stream", () => {
  it("attend le début de la fenêtre de 30 s suivante, plus une seconde, sans dériver", () => {
    const before = Date.now();
    const delay = viewerCountSampleDelayMs();
    const after = Date.now();

    expect(delay).toBeGreaterThan(1000);
    expect(delay).toBeLessThanOrEqual(31_000);
    const offset = (before + delay - 1000) % WINDOW_MS;
    expect(Math.min(offset, WINDOW_MS - offset)).toBeLessThanOrEqual(after - before);
  });

  it("échantillonne les sessions ouvertes au rythme du module, puis s'arrête avec lui", async () => {
    const session = await seedSession();
    await watch(session.channelId, new Date());

    const seen: { logs: readonly Record<string, unknown>[] } = { logs: [] };
    await withStreamModule({ connectPresence: true }, async (logs) => {
      seen.logs = logs;
      await eventually(async () => (await samplesOf([session.sessionId])).length > 0);
    });
    const loggedAtShutdown = seen.logs.length;
    await prisma.streamViewerCountSample.deleteMany({ where: { sessionId: session.sessionId } });
    await sleep(TEST_INTERVAL_MS * 5);

    expect(await samplesOf([session.sessionId])).toEqual([]);
    expect(seen.logs.slice(loggedAtShutdown)).toEqual([]);
  });

  it("journalise l'échec d'un échantillonnage sans arrêter le module", async () => {
    await seedSession();

    await withStreamModule({ connectPresence: false }, async (logs) => {
      const failures = () =>
        logs.filter(
          (log) =>
            log.level === "error" && log.msg === "échantillonnage du compteur de viewers en échec",
        );
      await eventually(() => failures().length > 1);

      expect(failures()[0]).toHaveProperty("error");
    });
  });
});
