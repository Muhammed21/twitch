import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { chat } from "@repo/authorization";
import { createContextClient, relayOutboxBatch, type TableRef } from "@repo/db";

import { createAuthzContext, createAuthzRedis } from "../../authz/authz-context.ts";
import { createRelayRedis, relayOutboxes } from "../../outbox-relay/outbox-relay.ts";
import { timeoutUser } from "./application/timeout-user.ts";
import { prismaTimeoutLedger } from "./infrastructure/prisma-timeout-ledger.ts";
import { redisSanctionedAssignmentsCache } from "./infrastructure/redis-sanctioned-assignments-cache.ts";

const urlOf = (variable: string): string => {
  const url = process.env[variable];
  if (url === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return url;
};

const NOW = new Date("2026-10-01T12:00:00.000Z");
const CONNECTION_LOST_AFTER_MS = 100;
const MODERATION_OUTBOX: TableRef = { schema: "moderation", table: "ModerationOutbox" };

const prisma = createContextClient({ context: "moderation", env: process.env });
const redis = createAuthzRedis(urlOf("REDIS_URL"));
const relayRedis = createRelayRedis(urlOf("REDIS_URL"));
const relayPool = new Pool({ connectionString: urlOf("DATABASE_URL_OUTBOX_RELAY") });

const secondsAfter = (instant: Date, seconds: number) =>
  new Date(instant.getTime() + seconds * 1000);

const authzAt = (instant: Date) => createAuthzContext({ prisma, redis, now: () => instant });

const timeout = timeoutUser({
  authz: authzAt(NOW),
  ledger: prismaTimeoutLedger(prisma),
  cache: redisSanctionedAssignmentsCache(redis),
  newId: randomUUID,
  now: () => NOW,
});

const seedOwnedChannel = async () => {
  const channel = { id: randomUUID(), ownerId: randomUUID() };
  await prisma.authzRoleAssignment.create({
    data: {
      subjectId: channel.ownerId,
      role: "owner",
      scopeType: "channel",
      scopeId: channel.id,
      grantedBy: "svc:test-moderation",
    },
  });
  return channel;
};

const bansOf = (userId: string) =>
  prisma.authzRoleAssignment.findMany({ where: { subjectId: userId, role: "banned" } });

const auditOf = (userId: string) =>
  prisma.auditEntry.findMany({ where: { targetId: userId, action: "moderation.user.timed_out" } });

const timedOutEventsOf = async (userId: string) =>
  (await prisma.moderationOutbox.findMany({ where: { name: "moderation.user.timed_out" } })).filter(
    (row) =>
      typeof row.payload === "object" &&
      row.payload !== null &&
      "userId" in row.payload &&
      row.payload.userId === userId,
  );

const canChat = async ({
  userId,
  channelId,
  at,
}: {
  userId: string;
  channelId: string;
  at: Date;
}) => (await authzAt(at).abilityFor(userId)).can("send", chat(channelId));

beforeAll(async () => {
  await Promise.all([redis.connect(), relayRedis.connect()]);
});

afterAll(async () => {
  redis.destroy();
  relayRedis.destroy();
  await relayPool.end();
  await prisma.$disconnect();
});

describe("timeout en base (ADR 0006)", () => {
  it("écrit l'attribution banned, l'audit de l'acteur humain et moderation.user.timed_out", async () => {
    const channel = await seedOwnedChannel();
    const viewer = randomUUID();

    const outcome = await timeout({
      actorId: channel.ownerId,
      channelId: channel.id,
      targetId: viewer,
      durationSeconds: 600,
    });

    const expiresAt = secondsAfter(NOW, 600);
    expect(outcome).toEqual({
      ok: true,
      value: { channelId: channel.id, userId: viewer, expiresAt, cacheInvalidated: true },
    });
    const bans = await bansOf(viewer);
    expect(bans).toEqual([
      expect.objectContaining({
        subjectId: viewer,
        role: "banned",
        scopeType: "channel",
        scopeId: channel.id,
        grantedBy: channel.ownerId,
        grantedAt: NOW,
        expiresAt,
        revokedAt: null,
      }),
    ]);
    expect(await auditOf(viewer)).toEqual([
      expect.objectContaining({
        occurredAt: NOW,
        actorId: channel.ownerId,
        onBehalfOf: null,
        scopeType: "channel",
        scopeId: channel.id,
        targetId: viewer,
        stateBefore: null,
        stateAfter: {
          assignmentId: bans[0]?.id,
          role: "banned",
          expiresAt: expiresAt.toISOString(),
        },
      }),
    ]);
    expect(await timedOutEventsOf(viewer)).toEqual([
      expect.objectContaining({
        version: 1,
        payload: { channelId: channel.id, userId: viewer, expiresAt: expiresAt.toISOString() },
        occurredAt: NOW,
        publishedAt: null,
      }),
    ]);
  });

  it("n'écrit ni attribution ni audit quand l'event ne peut pas entrer dans l'outbox", async () => {
    const channel = await seedOwnedChannel();
    const [first, second] = [randomUUID(), randomUUID()];
    const ledger = prismaTimeoutLedger(prisma);
    const outboxEventId = randomUUID();
    const recordFor = (targetId: string) =>
      ledger.record({
        timeoutId: randomUUID(),
        outboxEventId,
        channelId: channel.id,
        targetId,
        actorId: channel.ownerId,
        issuedAt: NOW,
        expiresAt: secondsAfter(NOW, 60),
      });

    await recordFor(first);

    await expect(recordFor(second)).rejects.toThrow('unique constraint "ModerationOutbox_pkey"');
    expect(await bansOf(second)).toEqual([]);
    expect(await auditOf(second)).toEqual([]);
  });

  it("refuse un timeout à un autre que le propriétaire, sans rien écrire", async () => {
    const channel = await seedOwnedChannel();
    const viewer = randomUUID();

    const outcome = await timeout({
      actorId: randomUUID(),
      channelId: channel.id,
      targetId: viewer,
      durationSeconds: 600,
    });

    expect(outcome).toEqual({ ok: false, error: "forbidden" });
    expect(await bansOf(viewer)).toEqual([]);
    expect(await auditOf(viewer)).toEqual([]);
    expect(await timedOutEventsOf(viewer)).toEqual([]);
  });
});

describe("effet du timeout sur les droits du sanctionné", () => {
  it("retire le chat dès le commit, même quand ses attributions étaient en cache", async () => {
    const channel = await seedOwnedChannel();
    const viewer = randomUUID();
    expect(await canChat({ userId: viewer, channelId: channel.id, at: NOW })).toBe(true);

    await timeout({
      actorId: channel.ownerId,
      channelId: channel.id,
      targetId: viewer,
      durationSeconds: 60,
    });

    expect(await canChat({ userId: viewer, channelId: channel.id, at: NOW })).toBe(false);
  });

  it("expire seul : le chat revient à l'échéance, sans aucune écriture", async () => {
    const channel = await seedOwnedChannel();
    const viewer = randomUUID();
    await timeout({
      actorId: channel.ownerId,
      channelId: channel.id,
      targetId: viewer,
      durationSeconds: 60,
    });

    expect(
      await canChat({ userId: viewer, channelId: channel.id, at: secondsAfter(NOW, 59) }),
    ).toBe(false);
    expect(
      await canChat({ userId: viewer, channelId: channel.id, at: secondsAfter(NOW, 60) }),
    ).toBe(true);
    expect(await bansOf(viewer)).toEqual([expect.objectContaining({ revokedAt: null })]);
  });
});

const eventIdOf = async (userId: string) => {
  const [event] = await timedOutEventsOf(userId);
  if (event === undefined) {
    throw new Error(`aucun moderation.user.timed_out pour ${userId}`);
  }
  return event.id;
};

describe("publication de moderation.user.timed_out pour le chat (ADR 0034)", () => {
  it("publie l'event sur events.moderation même si le relais s'arrête entre le commit et l'envoi", async () => {
    const channel = await seedOwnedChannel();
    const viewer = randomUUID();
    await timeout({
      actorId: channel.ownerId,
      channelId: channel.id,
      targetId: viewer,
      durationSeconds: 600,
    });
    const eventId = await eventIdOf(viewer);
    const crashedPool = new Pool({
      connectionString: urlOf("DATABASE_URL_OUTBOX_RELAY"),
      options: `-c idle_in_transaction_session_timeout=${CONNECTION_LOST_AFTER_MS}`,
      max: 1,
    });
    crashedPool.on("error", () => {});
    crashedPool.on("connect", (client) => client.on("error", () => {}));

    await expect(
      relayOutboxBatch({
        pool: crashedPool,
        outbox: MODERATION_OUTBOX,
        publish: async () => {
          await sleep(CONNECTION_LOST_AFTER_MS * 3);
          throw new Error("relais arrêté avant l'envoi");
        },
      }),
    ).rejects.toThrow("connection error");
    await crashedPool.end();
    expect(await prisma.moderationOutbox.findUnique({ where: { id: eventId } })).toMatchObject({
      publishedAt: null,
      attempts: 0,
    });

    await relayOutboxes({
      pool: relayPool,
      redis: relayRedis,
      outboxes: [MODERATION_OUTBOX],
      onError: () => {},
    });

    const entries = await relayRedis.xRevRange("events.moderation", "+", "-", { COUNT: 1000 });
    const published = entries
      .map((entry) => entry.message)
      .filter((message) => message["id"] === eventId)
      .map(({ payload, ...envelope }) => ({ ...envelope, payload: JSON.parse(String(payload)) }));
    expect(published).toEqual([
      {
        id: eventId,
        name: "moderation.user.timed_out",
        version: "1",
        occurredAt: NOW.toISOString(),
        payload: {
          channelId: channel.id,
          userId: viewer,
          expiresAt: secondsAfter(NOW, 600).toISOString(),
        },
      },
    ]);
    expect(await prisma.moderationOutbox.findUnique({ where: { id: eventId } })).toMatchObject({
      publishedAt: expect.any(Date),
    });
  });
});
