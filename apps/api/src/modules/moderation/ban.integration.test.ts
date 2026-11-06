import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { chat } from "@repo/authorization";
import { createContextClient } from "@repo/db";

import { createAuthzContext, createAuthzRedis } from "../../authz/authz-context.ts";
import type { AuditActor } from "../../platform/audit-actor.ts";
import { banUser } from "./application/ban-user.ts";
import { prismaBanLedger } from "./infrastructure/prisma-ban-ledger.ts";
import { redisSanctionedAssignmentsCache } from "./infrastructure/redis-sanctioned-assignments-cache.ts";

const urlOf = (variable: string): string => {
  const url = process.env[variable];
  if (url === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return url;
};

const NOW = new Date("2026-11-06T12:00:00.000Z");

const prisma = createContextClient({ context: "moderation", env: process.env });
const redis = createAuthzRedis(urlOf("REDIS_URL"));

const authzAt = (instant: Date) => createAuthzContext({ prisma, redis, now: () => instant });

const ban = banUser({
  authz: authzAt(NOW),
  ledger: prismaBanLedger(prisma),
  cache: redisSanctionedAssignmentsCache(redis),
  newId: randomUUID,
  now: () => NOW,
});

const seedModeratedChannel = async () => {
  const channel = { id: randomUUID(), moderatorId: randomUUID() };
  await prisma.authzRoleAssignment.create({
    data: {
      subjectId: channel.moderatorId,
      role: "moderator",
      scopeType: "channel",
      scopeId: channel.id,
      grantedBy: "svc:test-moderation",
    },
  });
  return channel;
};

const fromPayload = (actorId: string): AuditActor => ({
  actorId,
  onBehalfOf: "svc:payload-admin",
  source: "payload",
});

const bansOf = (userId: string) =>
  prisma.authzRoleAssignment.findMany({ where: { subjectId: userId, role: "banned" } });

const auditOf = (userId: string) =>
  prisma.auditEntry.findMany({ where: { targetId: userId, action: "moderation.user.banned" } });

const bannedEventsOf = async (userId: string) =>
  (await prisma.moderationOutbox.findMany({ where: { name: "moderation.user.banned" } })).filter(
    (row) =>
      typeof row.payload === "object" &&
      row.payload !== null &&
      "userId" in row.payload &&
      row.payload.userId === userId,
  );

const canChat = async ({ userId, channelId }: { userId: string; channelId: string }) =>
  (await authzAt(NOW).abilityFor(userId)).can("send", chat(channelId));

beforeAll(async () => {
  await redis.connect();
});

afterAll(async () => {
  redis.destroy();
  await prisma.$disconnect();
});

describe("bannissement en base (ADR 0006, ADR 0007)", () => {
  it("écrit l'attribution banned avec son motif, l'audit au nom de l'humain et moderation.user.banned", async () => {
    const channel = await seedModeratedChannel();
    const viewer = randomUUID();

    const outcome = await ban({
      actor: fromPayload(channel.moderatorId),
      channelId: channel.id,
      targetId: viewer,
      durationMinutes: 60,
      reason: "Harcèlement",
    });

    const expiresAt = new Date("2026-11-06T13:00:00.000Z");
    expect(outcome).toEqual({
      ok: true,
      value: {
        channelId: channel.id,
        userId: viewer,
        expiresAt,
        reason: "Harcèlement",
        cacheInvalidated: true,
      },
    });
    const bans = await bansOf(viewer);
    expect(bans).toEqual([
      expect.objectContaining({
        role: "banned",
        scopeType: "channel",
        scopeId: channel.id,
        grantedBy: channel.moderatorId,
        grantedAt: NOW,
        expiresAt,
        reason: "Harcèlement",
        revokedAt: null,
      }),
    ]);
    expect(await auditOf(viewer)).toEqual([
      expect.objectContaining({
        occurredAt: NOW,
        actorId: channel.moderatorId,
        onBehalfOf: "svc:payload-admin",
        source: "payload",
        scopeType: "channel",
        scopeId: channel.id,
        reason: "Harcèlement",
        stateAfter: {
          assignmentId: bans[0]?.id,
          role: "banned",
          expiresAt: expiresAt.toISOString(),
        },
      }),
    ]);
    expect(await bannedEventsOf(viewer)).toEqual([
      expect.objectContaining({
        version: 1,
        payload: { channelId: channel.id, userId: viewer, expiresAt: expiresAt.toISOString() },
        occurredAt: NOW,
        publishedAt: null,
      }),
    ]);
  });

  it("écrit un bannissement définitif sans fin, et l'event le dit", async () => {
    const channel = await seedModeratedChannel();
    const viewer = randomUUID();

    await ban({
      actor: fromPayload(channel.moderatorId),
      channelId: channel.id,
      targetId: viewer,
      durationMinutes: null,
      reason: "Spam",
    });

    expect(await bansOf(viewer)).toEqual([expect.objectContaining({ expiresAt: null })]);
    expect((await bannedEventsOf(viewer)).map((event) => event.payload)).toEqual([
      { channelId: channel.id, userId: viewer, expiresAt: null },
    ]);
  });

  it("retire le chat au banni dès le commit, même quand ses attributions étaient en cache", async () => {
    const channel = await seedModeratedChannel();
    const viewer = randomUUID();
    expect(await canChat({ userId: viewer, channelId: channel.id })).toBe(true);

    await ban({
      actor: fromPayload(channel.moderatorId),
      channelId: channel.id,
      targetId: viewer,
      durationMinutes: null,
      reason: "Spam",
    });

    expect(await canChat({ userId: viewer, channelId: channel.id })).toBe(false);
  });

  it("refuse un humain sans droit sur la chaîne, sans rien écrire", async () => {
    const channel = await seedModeratedChannel();
    const viewer = randomUUID();

    const outcome = await ban({
      actor: fromPayload(randomUUID()),
      channelId: channel.id,
      targetId: viewer,
      durationMinutes: 60,
      reason: "Spam",
    });

    expect(outcome).toEqual({ ok: false, error: "forbidden" });
    expect(await bansOf(viewer)).toEqual([]);
    expect(await auditOf(viewer)).toEqual([]);
    expect(await bannedEventsOf(viewer)).toEqual([]);
  });
});
