import { z } from "zod";

import { Uuid } from "../../conventions/schemas.ts";

export const userTimedOut = {
  name: "moderation.user.timed_out",
  version: 1,
  payload: z.looseObject({ channelId: Uuid, userId: Uuid, expiresAt: z.iso.datetime() }),
} as const;
