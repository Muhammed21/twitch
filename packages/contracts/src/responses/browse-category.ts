import { z } from "zod";

export const BrowseCategory = z
  .looseObject({
    slug: z.string(),
    name: z.string(),
    imageUrl: z.url().optional(),
    liveCount: z.int().min(1),
    viewerCount: z.int().min(0),
    tags: z.array(z.string()),
  })
  .meta({ id: "BrowseCategory" });

export const BrowseCategoryList = z
  .looseObject({
    items: z.array(BrowseCategory),
    nextCursor: z.string().optional(),
  })
  .meta({ id: "BrowseCategoryList" });

export const CategoryHeader = z
  .looseObject({
    slug: z.string(),
    name: z.string(),
    imageUrl: z.url().optional(),
    liveCount: z.int().min(0),
    viewerCount: z.int().min(0),
    tags: z.array(z.string()),
    followerCount: z.int().min(0),
    isFollowing: z.boolean().optional(),
  })
  .meta({ id: "CategoryHeader" });
