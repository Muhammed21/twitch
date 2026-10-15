import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import { Test } from "@nestjs/testing";
import { afterAll, describe, expect, it } from "vitest";

import { createContextClient } from "@repo/db";

import { createAuthzRedis } from "../../authz/authz-context.ts";
import { rejectingVerifier } from "../../platform/authentication.ts";
import { PlatformModule } from "../../platform/platform.module.ts";
import { createStreamConsumerRedis } from "../../platform/stream-consumer.ts";
import { recordStreamLifecycle } from "./application/record-stream-lifecycle.ts";
import { prismaStreamSessions } from "./infrastructure/prisma-stream-sessions.ts";
import { RECONCILIATION_INTERVAL_MS, StreamModule } from "./stream.module.ts";

const urlOf = (variable: string): string => {
  const url = process.env[variable];
  if (url === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return url;
};

const prisma = createContextClient({ context: "stream", env: process.env });

const record = recordStreamLifecycle({ sessions: prismaStreamSessions(prisma), newId: randomUUID });

const TEST_INTERVAL_MS = 20;

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

const seedLiveSession = async (startedAt: Date) => {
  const channel = { channelId: randomUUID(), providerChannelId: `provider-${randomUUID()}` };
  await prisma.streamChannel.create({ data: channel });
  const providerSessionId = `session-${randomUUID()}`;
  await record({
    eventId: randomUUID(),
    kind: "started",
    providerChannelId: channel.providerChannelId,
    providerSessionId,
    occurredAt: startedAt,
  });
  return providerSessionId;
};

const withStreamModule = async (
  { env = process.env }: { env?: Readonly<Record<string, string | undefined>> },
  run: (logs: readonly Record<string, unknown>[]) => Promise<void>,
) => {
  const logs: Record<string, unknown>[] = [];
  const authzRedis = createAuthzRedis(urlOf("REDIS_URL"));
  const consumerRedis = createStreamConsumerRedis(urlOf("REDIS_URL"));
  await Promise.all([authzRedis.connect(), consumerRedis.connect()]);
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
        prisma: createContextClient({ context: "stream", env }),
        webhookSecret: "secret-de-test",
        authzRedis,
        consumerRedis,
        logSink,
        reconciliationIntervalMs: TEST_INTERVAL_MS,
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

const eventually = async (check: () => Promise<boolean> | boolean) => {
  const deadline = Date.now() + 5000;
  while (!(await check())) {
    if (Date.now() > deadline) {
      throw new Error("condition jamais remplie");
    }
    await sleep(TEST_INTERVAL_MS);
  }
};

const endedAtOf = async (providerSessionId: string) =>
  (await prisma.streamSession.findUnique({ where: { providerSessionId } }))?.endedAt ?? null;

afterAll(async () => {
  await prisma.$disconnect();
});

describe("réconciliation périodique du module stream", () => {
  it("se répète toutes les minutes", () => {
    expect(RECONCILIATION_INTERVAL_MS).toBe(60_000);
  });

  it("clôt une session que le provider ne connaît pas, et le journalise", async () => {
    const forgotten = await seedLiveSession(minutesAgo(10));

    await withStreamModule({}, async (logs) => {
      await eventually(async () => (await endedAtOf(forgotten)) !== null);
      await eventually(() =>
        logs.some(
          (log) =>
            log.level === "info" &&
            log.msg === "sessions closes par la réconciliation" &&
            Array.isArray(log.closed) &&
            log.closed.includes(forgotten),
        ),
      );
      await sleep(TEST_INTERVAL_MS * 5);
      expect(
        logs.filter(
          (log) =>
            log.msg === "sessions closes par la réconciliation" &&
            Array.isArray(log.closed) &&
            log.closed.length === 0,
        ),
      ).toEqual([]);
    });
  });

  it("journalise l'échec d'une réconciliation sans arrêter le module", async () => {
    await withStreamModule(
      { env: { ...process.env, DATABASE_URL_STREAM: "postgresql://nobody:x@127.0.0.1:1/none" } },
      async (logs) => {
        const failures = () =>
          logs.filter((log) => log.level === "error" && log.msg === "réconciliation en échec");
        await eventually(() => failures().length > 1);

        expect(failures()[0]).toHaveProperty("error");
      },
    );
  });
});
