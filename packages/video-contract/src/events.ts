import { z } from "zod";

const KNOWN_TYPES = ["stream.started", "stream.ended"] as const;

const envelope = {
  id: z.uuid(),
  occurredAt: z.iso.datetime(),
};

const lifecycle = {
  ...envelope,
  channelId: z.string().min(1),
  sessionId: z.string().min(1),
};

export const StreamStarted = z.looseObject({ type: z.literal("stream.started"), ...lifecycle });

export const StreamEnded = z.looseObject({ type: z.literal("stream.ended"), ...lifecycle });

const isUnknownType = (type: string): boolean => !KNOWN_TYPES.some((known) => known === type);

const UnknownVideoEvent = z.looseObject({
  type: z.string().refine(isUnknownType),
  ...envelope,
});

export const VideoEvent = z.union([StreamStarted, StreamEnded, UnknownVideoEvent]);

export type StreamStarted = z.infer<typeof StreamStarted>;
export type StreamEnded = z.infer<typeof StreamEnded>;
export type VideoEvent = z.infer<typeof VideoEvent>;
