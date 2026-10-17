import { ACCESS_TOKEN_LIFETIME_SECONDS } from "../domain/token-lifetimes.ts";

export type RevocationReason = "refresh_token_reuse" | "password_reset";

export type RevokeAllSessionsCommand = {
  readonly userId: string;
  readonly reason: RevocationReason;
  readonly userAgent: string | null;
};

export interface SessionRevocationStore {
  revokeAll(command: RevokeAllSessionsCommand): Promise<readonly string[]>;
}

export interface RevokedSessionList {
  add(entry: { readonly sids: readonly string[]; readonly ttlSeconds: number }): Promise<void>;
}

export interface SessionRevocationBroadcast {
  publish(event: { readonly userId: string; readonly sids: readonly string[] }): Promise<void>;
}

export const revokeAllSessions =
  ({
    store,
    revokedSessions,
    broadcast,
  }: {
    store: SessionRevocationStore;
    revokedSessions: RevokedSessionList;
    broadcast: SessionRevocationBroadcast;
  }) =>
  async (command: RevokeAllSessionsCommand): Promise<readonly string[]> => {
    const sids = await store.revokeAll(command);
    await revokedSessions.add({ sids, ttlSeconds: ACCESS_TOKEN_LIFETIME_SECONDS });
    await broadcast.publish({ userId: command.userId, sids });
    return sids;
  };
