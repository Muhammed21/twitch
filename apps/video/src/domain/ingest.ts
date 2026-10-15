import { timingSafeEqual } from "node:crypto";

import { err, ok, type Result } from "@repo/result";

const KEY_BYTES = 32;
const KEY_PREFIX = "sk_live_";

export type VideoChannel = {
  readonly id: string;
  readonly externalId: string;
  readonly streamKey: string;
};

export type IngestSession =
  | { readonly state: "idle"; readonly id: string; readonly channelId: string }
  | {
      readonly state: "live";
      readonly id: string;
      readonly channelId: string;
      readonly startedAt: Date;
    }
  | {
      readonly state: "ended";
      readonly id: string;
      readonly channelId: string;
      readonly startedAt: Date;
      readonly endedAt: Date;
    };

type LiveSession = Extract<IngestSession, { state: "live" }>;
type EndedSession = Extract<IngestSession, { state: "ended" }>;

export type PublishRefusal = "invalid_key" | "already_live" | "not_idle";

export const streamKeyFrom = (
  randomBytes: (size: number) => Uint8Array,
): Result<string, "invalid_entropy"> => {
  const entropy = randomBytes(KEY_BYTES);
  return entropy.length === KEY_BYTES
    ? ok(`${KEY_PREFIX}${Buffer.from(entropy).toString("hex")}`)
    : err("invalid_entropy");
};

export const rotateStreamKey = (channel: VideoChannel, streamKey: string): VideoChannel => ({
  ...channel,
  streamKey,
});

const matches = (expected: string, presented: string): boolean => {
  const left = Buffer.from(expected);
  const right = Buffer.from(presented);
  return left.length === right.length && timingSafeEqual(left, right);
};

export const openSession = ({
  id,
  channelId,
}: {
  id: string;
  channelId: string;
}): IngestSession => ({
  state: "idle",
  id,
  channelId,
});

export const publish = ({
  channel,
  presentedKey,
  session,
  channelSessions,
  now,
}: {
  channel: VideoChannel;
  presentedKey: string;
  session: IngestSession;
  channelSessions: readonly IngestSession[];
  now: Date;
}): Result<LiveSession, PublishRefusal> => {
  if (session.channelId !== channel.id || !matches(channel.streamKey, presentedKey)) {
    return err("invalid_key");
  }
  if (session.state !== "idle") {
    return err("not_idle");
  }
  if (channelSessions.some(({ state }) => state === "live")) {
    return err("already_live");
  }
  return ok({ state: "live", id: session.id, channelId: session.channelId, startedAt: now });
};

export const stop = (session: IngestSession, now: Date): Result<EndedSession, "not_live"> =>
  session.state === "live" ? ok({ ...session, state: "ended", endedAt: now }) : err("not_live");
