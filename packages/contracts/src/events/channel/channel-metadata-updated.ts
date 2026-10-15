import { z } from "zod";

import { Uuid } from "../../conventions/schemas.ts";

export const channelMetadataUpdated = {
  name: "channel.metadata.updated",
  version: 1,
  payload: z.looseObject({ channelId: Uuid, title: z.string() }),
} as const;
