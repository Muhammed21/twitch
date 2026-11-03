import type { IngestSession, LifecycleEvent, VideoChannel } from "../domain/ingest.ts";
import type { VideoStore } from "./control-plane.ts";

type LiveSession = Extract<IngestSession, { state: "live" }>;

const isLive = (session: IngestSession): session is LiveSession => session.state === "live";

export type InMemoryVideoStore = VideoStore & {
  readonly eventsOf: (sessionId: string) => Promise<readonly LifecycleEvent[]>;
};

export const inMemoryVideoStore = (): InMemoryVideoStore => {
  const channels = new Map<string, VideoChannel>();
  const sessionsById = new Map<string, IngestSession>();
  const outbox: LifecycleEvent[] = [];

  return {
    findChannel: async (id) => channels.get(id),
    findChannelByExternalId: async (externalId) =>
      [...channels.values()].find((channel) => channel.externalId === externalId),
    findChannelByStreamKey: async (streamKey) =>
      [...channels.values()].find((channel) => channel.streamKey === streamKey),
    saveChannel: async (channel) => {
      channels.set(channel.id, channel);
    },
    liveSessions: async () => [...sessionsById.values()].filter(isLive),
    saveSession: async (session, events) => {
      sessionsById.set(session.id, session);
      outbox.push(...events);
    },
    eventsOf: async (sessionId) => outbox.filter((event) => event.sessionId === sessionId),
  };
};
