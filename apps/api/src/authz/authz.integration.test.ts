import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import { channel } from "@repo/authorization";
import { createContextClient } from "@repo/db";

import { settledWithin, withPausedRedis } from "../platform/testing/paused-redis.ts";
import {
  ASSIGNMENTS_TTL_SECONDS,
  cacheIfUnchanged,
  createAuthzContext,
  createAuthzRedis,
  invalidateAssignments,
} from "./authz-context.ts";

const urlOf = (variable: string): string => {
  const url = process.env[variable];
  if (url === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return url;
};

const NOW = new Date("2026-10-12T12:00:00.000Z");

const assignmentsKey = (userId: string) => `authz:assign:${userId}`;

const generationOf = async (
  redis: { get: (key: string) => Promise<string | null> },
  userId: string,
) => (await redis.get(`authz:gen:${userId}`)) ?? "0";

const AUTHZ_INVALIDATED_CHANNEL = "authz.invalidated";

const prisma = createContextClient({ context: "channel", env: process.env });

afterAll(async () => {
  await prisma.$disconnect();
});

const withRedis = async <T>(
  run: (redis: Awaited<ReturnType<typeof connectRedis>>) => Promise<T>,
) => {
  const redis = await connectRedis();
  try {
    return await run(redis);
  } finally {
    redis.destroy();
  }
};

const connectRedis = () => createAuthzRedis(urlOf("REDIS_URL")).connect();

const grant = ({
  subjectId,
  role = "owner",
  scopeId = `channel-${randomUUID()}`,
  revokedAt = null,
}: {
  subjectId: string;
  role?: "owner" | "moderator" | "vip";
  scopeId?: string;
  revokedAt?: Date | null;
}) =>
  prisma.authzRoleAssignment.create({
    data: { subjectId, role, scopeType: "channel", scopeId, grantedBy: subjectId, revokedAt },
  });

const revokeAll = (subjectId: string) =>
  prisma.authzRoleAssignment.updateMany({
    where: { subjectId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

describe("AuthzContext sur PostgreSQL et Redis (ADR 0006 §5)", () => {
  it("lit les attributions actives en base, puis les garde en cache 300 s", async () => {
    await withRedis(async (redis) => {
      const subjectId = randomUUID();
      const { scopeId } = await grant({ subjectId });
      const context = createAuthzContext({ prisma, redis, now: () => NOW });

      expect(await context.assignmentsOf(subjectId)).toEqual([
        {
          role: "owner",
          scope: { type: "channel", channelId: scopeId },
          expiresAt: null,
          revokedAt: null,
        },
      ]);
      const ttl = await redis.ttl(assignmentsKey(subjectId));
      expect(ttl).toBeGreaterThan(ASSIGNMENTS_TTL_SECONDS - 5);
      expect(ttl).toBeLessThanOrEqual(ASSIGNMENTS_TTL_SECONDS);
      expect(ASSIGNMENTS_TTL_SECONDS).toBe(300);
      expect(await redis.clientList()).toContainEqual(
        expect.objectContaining({ name: "api-authz" }),
      );
    });
  });

  it("sert le cache sans relire la base tant qu'il n'est pas invalidé", async () => {
    await withRedis(async (redis) => {
      const subjectId = randomUUID();
      await grant({ subjectId });
      const context = createAuthzContext({ prisma, redis, now: () => NOW });
      await context.assignmentsOf(subjectId);
      await grant({ subjectId, role: "vip" });

      expect(await context.assignmentsOf(subjectId)).toHaveLength(1);
    });
  });

  it("relit la base après invalidation, la clé étant supprimée avant la publication", async () => {
    await withRedis(async (redis) => {
      const subjectId = randomUUID();
      const { scopeId } = await grant({ subjectId });
      const context = createAuthzContext({ prisma, redis, now: () => NOW });
      await context.assignmentsOf(subjectId);
      await revokeAll(subjectId);
      const subscriber = await connectRedis();
      const received: { message: unknown; keyStillCached: number }[] = [];
      await subscriber.subscribe(AUTHZ_INVALIDATED_CHANNEL, async (message) => {
        received.push({
          message: JSON.parse(message),
          keyStillCached: await redis.exists(assignmentsKey(subjectId)),
        });
      });

      await invalidateAssignments({ redis, userId: subjectId });
      await vi.waitFor(() => expect(received).toHaveLength(1));
      subscriber.destroy();

      expect(received).toEqual([{ message: { userId: subjectId }, keyStillCached: 0 }]);
      expect(await context.assignmentsOf(subjectId)).toEqual([]);
      expect((await context.abilityFor(subjectId)).can("update", channel(scopeId))).toBe(false);
    });
  });

  it("n'écrit pas en cache une lecture devancée par une invalidation", async () => {
    await withRedis(async (redis) => {
      const userId = randomUUID();
      const generation = await generationOf(redis, userId);
      await invalidateAssignments({ redis, userId });

      await cacheIfUnchanged({ redis, userId, generation, assignments: [] });

      expect(await redis.exists(assignmentsKey(userId))).toBe(0);
    });
  });

  it("écrit en cache une lecture dont la génération n'a pas changé", async () => {
    await withRedis(async (redis) => {
      const userId = randomUUID();
      await invalidateAssignments({ redis, userId });
      const generation = await generationOf(redis, userId);

      await cacheIfUnchanged({ redis, userId, generation, assignments: [] });

      expect(await redis.get(assignmentsKey(userId))).toBe("[]");
      expect(await redis.ttl(assignmentsKey(userId))).toBeGreaterThan(ASSIGNMENTS_TTL_SECONDS - 5);
    });
  });

  it("change de génération à chaque invalidation", async () => {
    await withRedis(async (redis) => {
      const userId = randomUUID();
      const before = await generationOf(redis, userId);
      await invalidateAssignments({ redis, userId });
      const after = await generationOf(redis, userId);
      await invalidateAssignments({ redis, userId });

      expect(new Set([before, after, await generationOf(redis, userId)]).size).toBe(3);
    });
  });

  it("ignore les attributions révoquées", async () => {
    await withRedis(async (redis) => {
      const subjectId = randomUUID();
      await grant({ subjectId, revokedAt: new Date("2026-10-01T00:00:00.000Z") });
      const context = createAuthzContext({ prisma, redis, now: () => NOW });

      expect(await context.assignmentsOf(subjectId)).toEqual([]);
    });
  });

  it("lit les attributions par pages bornées (ADR 0008)", async () => {
    await withRedis(async (redis) => {
      const subjectId = randomUUID();
      await Promise.all([grant({ subjectId }), grant({ subjectId }), grant({ subjectId })]);
      const context = createAuthzContext({ prisma, redis, now: () => NOW, pageSize: 2 });

      expect(await context.assignmentsOf(subjectId)).toHaveLength(3);
    });
  });

  it("construit l'ability des attributions lues", async () => {
    await withRedis(async (redis) => {
      const subjectId = randomUUID();
      const { scopeId } = await grant({ subjectId });
      const context = createAuthzContext({ prisma, redis, now: () => NOW });

      expect((await context.abilityFor(subjectId)).can("update", channel(scopeId))).toBe(true);
    });
  });

  it("lit la base quand Redis ne répond pas, sans attendre plus de deux délais de 2 s", async () => {
    const subjectId = randomUUID();
    await grant({ subjectId });
    const unreachable = createAuthzRedis("redis://127.0.0.1:1").on("error", () => {});
    unreachable.connect().catch(() => {});
    const context = createAuthzContext({ prisma, redis: unreachable, now: () => NOW });
    const startedAt = performance.now();

    const assignments = await context.assignmentsOf(subjectId);
    const elapsed = performance.now() - startedAt;
    unreachable.destroy();

    expect(assignments).toHaveLength(1);
    expect(elapsed).toBeLessThan(8000);
    expect(await withRedis((redis) => redis.exists(assignmentsKey(subjectId)))).toBe(0);
  });

  it("lit la base sans attendre Redis quand il ne répond plus en 2 s", async () => {
    await withRedis(async (redis) => {
      const subjectId = randomUUID();
      const { scopeId } = await grant({ subjectId });
      const context = createAuthzContext({ prisma, redis, now: () => NOW });

      const read = await withPausedRedis(urlOf("REDIS_URL"), () =>
        settledWithin(() => context.assignmentsOf(subjectId), 3000),
      );

      expect(read).toEqual({
        status: "fulfilled",
        value: [expect.objectContaining({ scope: { type: "channel", channelId: scopeId } })],
        inTime: true,
      });
    });
  });

  it("échoue l'invalidation au lieu d'attendre quand Redis ne répond plus en 2 s", async () => {
    await withRedis(async (redis) => {
      const invalidation = await withPausedRedis(urlOf("REDIS_URL"), () =>
        settledWithin(() => invalidateAssignments({ redis, userId: randomUUID() }), 3000),
      );

      expect(invalidation).toEqual({
        status: "rejected",
        reason: expect.objectContaining({ message: expect.stringContaining("2000 ms") }),
        inTime: true,
      });
    });
  });
});
