import { z } from "zod";

import { Uuid } from "../../conventions/schemas.ts";

export const channelCategoryFollowed = {
  name: "channel.category.followed",
  version: 1,
  payload: z.looseObject({
    userId: Uuid,
    categoryId: Uuid,
    followedAt: z.iso.datetime(),
    version: z.int().positive(),
  }),
} as const;
