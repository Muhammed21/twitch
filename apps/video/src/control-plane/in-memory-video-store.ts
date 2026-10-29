import type { IngestSession, VideoChannel } from "../domain/ingest.ts";
import type { VideoStore } from "./control-plane.ts";

type LiveSession = Extract<IngestSession, { state: "live" }>;

const isLive = (session: IngestSession): session is LiveSession => session.state === "live";

export const inMemoryVideoStore = (): VideoStore => {
  const channels = new Map<string, VideoChannel>();
  const sessionsById = new Map<string, IngestSession>();

  return {
    findChannel: async (id) => channels.get(id),
    findChannelByExternalId: async (externalId) =>
      [...channels.values()].find((channel) => channel.externalId === externalId),
    saveChannel: async (channel) => {
      channels.set(channel.id, channel);
    },
    liveSessions: async () => [...sessionsById.values()].filter(isLive),
    saveSession: async (session) => {
      sessionsById.set(session.id, session);
    },
  };
};
