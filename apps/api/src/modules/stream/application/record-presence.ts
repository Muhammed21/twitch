import type { PresenceStore } from "./presence.ts";

export const recordPresence =
  ({ store, now }: { store: PresenceStore; now: () => Date }) =>
  ({ channelId, viewerId }: { channelId: string; viewerId: string }): Promise<void> =>
    store.record({ channelId, viewerId, at: now() });
