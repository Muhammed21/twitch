import { err, ok, type Result } from "@repo/result";

import {
  type IngestSession,
  rotateStreamKey as withStreamKey,
  stop,
  streamKeyFrom,
  type VideoChannel,
} from "../domain/ingest.ts";

type LiveSession = Extract<IngestSession, { state: "live" }>;

export interface VideoStore {
  findChannel(id: string): Promise<VideoChannel | undefined>;
  findChannelByExternalId(externalId: string): Promise<VideoChannel | undefined>;
  saveChannel(channel: VideoChannel): Promise<void>;
  liveSessions(): Promise<readonly LiveSession[]>;
  saveSession(session: IngestSession): Promise<void>;
}

export type StreamCredentials = { readonly streamKey: string; readonly ingestUrl: string };

export type ProvisionedChannel = { readonly channel: VideoChannel; readonly created: boolean };

export type ControlPlane = {
  readonly createChannel: (
    externalId: string,
  ) => Promise<Result<ProvisionedChannel, "invalid_entropy">>;
  readonly streamKey: (channelId: string) => Promise<StreamCredentials | undefined>;
  readonly rotateStreamKey: (
    channelId: string,
  ) => Promise<Result<StreamCredentials, "not_found" | "invalid_entropy">>;
  readonly stopStream: (
    channelId: string,
    now: Date,
  ) => Promise<Result<undefined, "not_found" | "not_live">>;
  readonly liveStreams: () => Promise<readonly LiveSession[]>;
};

export const createControlPlane = ({
  store,
  ingestUrl,
  newId,
  randomBytes,
}: {
  store: VideoStore;
  ingestUrl: string;
  newId: () => string;
  randomBytes: (size: number) => Uint8Array;
}): ControlPlane => {
  const credentialsOf = ({ streamKey }: VideoChannel): StreamCredentials => ({
    streamKey,
    ingestUrl,
  });

  return {
    createChannel: async (externalId) => {
      const existing = await store.findChannelByExternalId(externalId);
      if (existing !== undefined) {
        return ok({ channel: existing, created: false });
      }
      const streamKey = streamKeyFrom(randomBytes);
      if (!streamKey.ok) {
        return streamKey;
      }
      const channel = { id: newId(), externalId, streamKey: streamKey.value };
      await store.saveChannel(channel);
      return ok({ channel, created: true });
    },

    streamKey: async (channelId) => {
      const channel = await store.findChannel(channelId);
      return channel === undefined ? undefined : credentialsOf(channel);
    },

    rotateStreamKey: async (channelId) => {
      const channel = await store.findChannel(channelId);
      if (channel === undefined) {
        return err("not_found");
      }
      const streamKey = streamKeyFrom(randomBytes);
      if (!streamKey.ok) {
        return streamKey;
      }
      const rotated = withStreamKey(channel, streamKey.value);
      await store.saveChannel(rotated);
      return ok(credentialsOf(rotated));
    },

    stopStream: async (channelId, now) => {
      if ((await store.findChannel(channelId)) === undefined) {
        return err("not_found");
      }
      const live = (await store.liveSessions()).find((session) => session.channelId === channelId);
      const ended = live === undefined ? err<"not_live">("not_live") : stop(live, now);
      if (!ended.ok) {
        return ended;
      }
      await store.saveSession(ended.value);
      return ok(undefined);
    },

    liveStreams: () => store.liveSessions(),
  };
};
