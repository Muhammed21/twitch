import { z } from "zod";

export const BrowseCategory = z
  .looseObject({
    slug: z.string(),
    name: z.string(),
    imageUrl: z.url().optional(),
    liveCount: z.int().min(1),
    viewerCount: z.int().min(0),
  })
  .meta({ id: "BrowseCategory" });

export const BrowseCategoryList = z
  .looseObject({
    items: z.array(BrowseCategory),
    nextCursor: z.string().optional(),
  })
  .meta({ id: "BrowseCategoryList" });
