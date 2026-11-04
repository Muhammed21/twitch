import { z } from "zod";

import { openEnum, Uuid } from "../../conventions/schemas.ts";

export const channelCategoryUnfollowed = {
  name: "channel.category.unfollowed",
  version: 1,
  payload: z.looseObject({
    userId: Uuid,
    categoryId: Uuid,
    reason: openEnum(["unfollowed", "category_merged", "category_retired"]),
    version: z.int().positive(),
  }),
} as const;
