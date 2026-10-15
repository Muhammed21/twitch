import { createClient } from "redis";

import type { RevokedSessions } from "@repo/auth-verifier";

import { withRedisDeadline } from "../../../platform/redis-deadline.ts";
import type {
  RevokedSessionList,
  SessionRevocationBroadcast,
} from "../application/revoke-all-sessions.ts";

const COMMAND_TIMEOUT_MS = 2000;

export const createIdentityRedis = (url?: string) =>
  createClient({ url, name: "api-identity", commandOptions: { timeout: COMMAND_TIMEOUT_MS } });

export type IdentityRedis = ReturnType<typeof createIdentityRedis>;

export const SESSION_REVOKED_CHANNEL = "identity.session.revoked";

export const revokedSidKey = (sid: string): string => `identity:revoked-sid:${sid}`;

export const redisRevokedSessions = (redis: IdentityRedis): RevokedSessions => ({
  isRevoked: async (sid) => (await withRedisDeadline(redis.exists(revokedSidKey(sid)))) === 1,
});

export const redisRevokedSessionList = (redis: IdentityRedis): RevokedSessionList => ({
  add: async ({ sids, ttlSeconds }) => {
    await Promise.all(
      sids.map((sid) =>
        withRedisDeadline(
          redis.set(revokedSidKey(sid), "1", { expiration: { type: "EX", value: ttlSeconds } }),
        ),
      ),
    );
  },
});

export const redisSessionRevocationBroadcast = (
  redis: IdentityRedis,
): SessionRevocationBroadcast => ({
  publish: async (event) => {
    await withRedisDeadline(redis.publish(SESSION_REVOKED_CHANNEL, JSON.stringify(event)));
  },
});
