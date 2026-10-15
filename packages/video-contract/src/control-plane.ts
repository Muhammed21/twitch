import { z } from "zod";

export const CreateChannelRequest = z.strictObject({ externalId: z.uuid() });

export const VideoChannel = z.looseObject({
  id: z.string().min(1),
  externalId: z.uuid(),
});

export const StreamKey = z.looseObject({
  streamKey: z.string().min(1),
  ingestUrl: z.url({ protocol: /^rtmps?$/ }),
});

export const LiveStreams = z.looseObject({
  streams: z.array(
    z.looseObject({
      sessionId: z.string().min(1),
      channelId: z.string().min(1),
      startedAt: z.iso.datetime(),
    }),
  ),
});

export const Problem = z.looseObject({
  type: z.string(),
  title: z.string(),
  status: z.int().min(100).max(599),
  detail: z.string().optional(),
  errors: z.array(z.looseObject({ path: z.string(), message: z.string() })).optional(),
});

export type CreateChannelRequest = z.infer<typeof CreateChannelRequest>;
export type VideoChannel = z.infer<typeof VideoChannel>;
export type StreamKey = z.infer<typeof StreamKey>;
export type LiveStreams = z.infer<typeof LiveStreams>;
export type Problem = z.infer<typeof Problem>;
