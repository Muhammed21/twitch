import { z } from "zod";

import { Uuid } from "../../conventions/schemas.ts";

export const streamStarted = {
  name: "stream.started",
  version: 1,
  payload: z.looseObject({ sessionId: Uuid, channelId: Uuid, startedAt: z.iso.datetime() }),
} as const;
