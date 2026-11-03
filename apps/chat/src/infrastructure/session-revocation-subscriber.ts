import { SESSION_REVOKED_CHANNEL, sessionRevocationOf } from "@repo/auth-verifier";

export type RevocationSubscriber = {
  subscribe(channel: string, listener: (message: string) => void): Promise<unknown>;
};

export const subscribeToSessionRevocations = async ({
  subscriber,
  onRevoked,
  onMalformed,
}: {
  subscriber: RevocationSubscriber;
  onRevoked: (sids: readonly string[]) => void;
  onMalformed: (message: string) => void;
}): Promise<void> => {
  await subscriber.subscribe(SESSION_REVOKED_CHANNEL, (message) => {
    const revocation = sessionRevocationOf(message);
    if (revocation.ok) {
      onRevoked(revocation.value.sids);
      return;
    }
    onMalformed(message);
  });
};
