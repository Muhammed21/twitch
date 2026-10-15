import { z } from "zod";

import { Uuid } from "../../conventions/schemas.ts";

export const streamEnded = {
  name: "stream.ended",
  version: 1,
  payload: z.looseObject({ sessionId: Uuid, channelId: Uuid, endedAt: z.iso.datetime() }),
} as const;
