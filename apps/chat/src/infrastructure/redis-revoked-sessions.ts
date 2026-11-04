import { type RevokedSessions, revokedSidKey } from "@repo/auth-verifier";

import { withDeadline } from "./deadline.ts";

const REVOCATION_DEADLINE_MS = 200;

export type RevocationReader = { exists(key: string): Promise<number> };

export const redisRevokedSessions = (redis: RevocationReader): RevokedSessions => ({
  isRevoked: async (sid) =>
    (await withDeadline(redis.exists(revokedSidKey(sid)), REVOCATION_DEADLINE_MS)) === 1,
});
