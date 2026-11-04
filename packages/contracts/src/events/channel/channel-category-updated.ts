import { z } from "zod";

import { Uuid } from "../../conventions/schemas.ts";

export const channelCategoryUpdated = {
  name: "channel.category.updated",
  version: 1,
  payload: z.looseObject({ categoryId: Uuid, name: z.string(), imageKey: z.string().nullable() }),
} as const;
