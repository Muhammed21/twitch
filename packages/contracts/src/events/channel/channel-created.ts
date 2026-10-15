import { z } from "zod";

import { Uuid } from "../../conventions/schemas.ts";

export const channelCreated = {
  name: "channel.created",
  version: 1,
  payload: z.looseObject({ channelId: Uuid, ownerId: Uuid, slug: z.string() }),
} as const;
