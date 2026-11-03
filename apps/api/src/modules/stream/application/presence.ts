export interface PresenceStore {
  record(heartbeat: { channelId: string; viewerId: string; at: Date }): Promise<void>;
  count(request: { channelIds: readonly string[]; at: Date }): Promise<ReadonlyMap<string, number>>;
}
