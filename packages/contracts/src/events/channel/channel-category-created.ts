import { z } from "zod";

import { Uuid } from "../../conventions/schemas.ts";

export const channelCategoryCreated = {
  name: "channel.category.created",
  version: 1,
  payload: z.looseObject({ categoryId: Uuid, slug: z.string(), name: z.string() }),
} as const;
