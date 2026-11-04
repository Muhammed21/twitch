import { z } from "zod";

import { Uuid } from "../../conventions/schemas.ts";

export const channelCategoryRetired = {
  name: "channel.category.retired",
  version: 1,
  payload: z.looseObject({ categoryId: Uuid }),
} as const;
