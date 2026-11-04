import { z } from "zod";

import { Uuid } from "../../conventions/schemas.ts";

export const channelCategoryMerged = {
  name: "channel.category.merged",
  version: 1,
  payload: z.looseObject({ sourceCategoryId: Uuid, targetCategoryId: Uuid }),
} as const;
