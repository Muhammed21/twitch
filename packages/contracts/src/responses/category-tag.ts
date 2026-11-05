import { z } from "zod";

export const CategoryTag = z
  .looseObject({
    name: z.string().min(1),
    categoryCount: z.int().min(1),
  })
  .meta({ id: "CategoryTag" });

export const CategoryTagList = z
  .looseObject({
    items: z.array(CategoryTag),
  })
  .meta({ id: "CategoryTagList" });
