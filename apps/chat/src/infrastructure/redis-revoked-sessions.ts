import { type RevokedSessions, revokedSidKey } from "@repo/auth-verifier";

const REVOCATION_DEADLINE_MS = 200;

export type RevocationReader = { exists(key: string): Promise<number> };

const withDeadline = <T>(command: Promise<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Redis n'a pas répondu en ${REVOCATION_DEADLINE_MS} ms`)),
      REVOCATION_DEADLINE_MS,
    );
    command.finally(() => clearTimeout(timer)).then(resolve, reject);
  });

export const redisRevokedSessions = (redis: RevocationReader): RevokedSessions => ({
  isRevoked: async (sid) => (await withDeadline(redis.exists(revokedSidKey(sid)))) === 1,
});
