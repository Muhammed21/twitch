import { createClient } from "redis";

import { type AuthzContext, authzContextFrom, type RoleAssignment } from "@repo/authorization";
import { collectByKeyset, type createContextClient } from "@repo/db";

import { fromCache, fromRows, toCache } from "./assignment-record.ts";

export const ASSIGNMENTS_TTL_SECONDS = 300;

export const AUTHZ_INVALIDATED_CHANNEL = "authz.invalidated";

const PAGE_SIZE = 500;

const COMMAND_TIMEOUT_MS = 2000;

export const assignmentsKey = (userId: string): string => `authz:assign:${userId}`;

export const createAuthzRedis = (url?: string) =>
  createClient({ url, name: "api-authz", commandOptions: { timeout: COMMAND_TIMEOUT_MS } });

export type AuthzRedis = ReturnType<typeof createAuthzRedis>;

type ContextPrisma = ReturnType<typeof createContextClient>;

const generationKey = (userId: string): string => `authz:gen:${userId}`;

const SET_IF_GENERATION_UNCHANGED = `
if (redis.call("GET", KEYS[2]) or "0") == ARGV[1] then
  redis.call("SET", KEYS[1], ARGV[2], "EX", ARGV[3])
end
return 0`;

export const readGeneration = async ({
  redis,
  userId,
}: {
  redis: AuthzRedis;
  userId: string;
}): Promise<string> => (await redis.get(generationKey(userId))) ?? "0";

export const cacheIfUnchanged = async ({
  redis,
  userId,
  generation,
  assignments,
}: {
  redis: AuthzRedis;
  userId: string;
  generation: string;
  assignments: readonly RoleAssignment[];
}): Promise<void> => {
  await redis.eval(SET_IF_GENERATION_UNCHANGED, {
    keys: [assignmentsKey(userId), generationKey(userId)],
    arguments: [generation, toCache(assignments), String(ASSIGNMENTS_TTL_SECONDS)],
  });
};

const bestEffort = async <T>(run: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await run();
  } catch {
    return fallback;
  }
};

type AssignmentRow = {
  readonly id: string;
  readonly role: string;
  readonly scopeType: string;
  readonly scopeId: string;
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
};

const readDatabase = (prisma: ContextPrisma, userId: string, pageSize: number) =>
  collectByKeyset<AssignmentRow>({
    pageSize,
    keyOf: ({ id }) => id,
    fetchPage: ({ take, after }) =>
      prisma.authzRoleAssignment.findMany({
        where: { subjectId: userId, revokedAt: null, id: { gt: after } },
        select: {
          id: true,
          role: true,
          scopeType: true,
          scopeId: true,
          expiresAt: true,
          revokedAt: true,
        },
        orderBy: { id: "asc" },
        take,
      }),
  });

export const createAuthzContext = ({
  prisma,
  redis,
  now,
  pageSize = PAGE_SIZE,
}: {
  prisma: ContextPrisma;
  redis: AuthzRedis;
  now: () => Date;
  pageSize?: number;
}): AuthzContext =>
  authzContextFrom({
    now,
    assignmentsOf: async (userId) => {
      const cached = await bestEffort(
        async () => fromCache(await redis.get(assignmentsKey(userId))),
        null,
      );
      if (cached !== null) {
        return cached;
      }
      const generation = await bestEffort(() => readGeneration({ redis, userId }), null);
      const assignments = fromRows(await readDatabase(prisma, userId, pageSize));
      if (generation !== null) {
        await bestEffort(
          () => cacheIfUnchanged({ redis, userId, generation, assignments }),
          undefined,
        );
      }
      return assignments;
    },
  });

export const invalidateAssignments = async ({
  redis,
  userId,
}: {
  redis: AuthzRedis;
  userId: string;
}): Promise<void> => {
  await redis.incr(generationKey(userId));
  await redis.del(assignmentsKey(userId));
  await redis.publish(AUTHZ_INVALIDATED_CHANNEL, JSON.stringify({ userId }));
};
