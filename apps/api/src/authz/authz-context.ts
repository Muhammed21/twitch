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

const readCache = async (redis: AuthzRedis, userId: string) => {
  try {
    return fromCache(await redis.get(assignmentsKey(userId)));
  } catch {
    return null;
  }
};

const writeCache = async (
  redis: AuthzRedis,
  userId: string,
  assignments: readonly RoleAssignment[],
) => {
  try {
    await redis.set(assignmentsKey(userId), toCache(assignments), {
      expiration: { type: "EX", value: ASSIGNMENTS_TTL_SECONDS },
    });
  } catch {
    return;
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
      const cached = await readCache(redis, userId);
      if (cached !== null) {
        return cached;
      }
      const assignments = fromRows(await readDatabase(prisma, userId, pageSize));
      await writeCache(redis, userId, assignments);
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
  await redis.del(assignmentsKey(userId));
  await redis.publish(AUTHZ_INVALIDATED_CHANNEL, JSON.stringify({ userId }));
};
