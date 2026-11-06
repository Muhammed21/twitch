import { z } from "zod";

import { Uuid } from "../../conventions/schemas.ts";

export const userBanned = {
  name: "moderation.user.banned",
  version: 1,
  payload: z.looseObject({ channelId: Uuid, userId: Uuid, expiresAt: z.iso.datetime().nullable() }),
} as const;
