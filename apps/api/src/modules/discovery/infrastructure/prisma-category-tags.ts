import type { ActiveCategoryTags } from "../application/category-tags.ts";
import type { DiscoveryPrisma } from "./prisma-live-channel-projection.ts";

export const prismaActiveCategoryTags = (prisma: DiscoveryPrisma): ActiveCategoryTags => ({
  tagsOfActiveCategories: async () =>
    (
      await prisma.discoveryCategoryView.findMany({
        where: { status: "active", slug: { not: null } },
        select: { tags: true },
      })
    ).map(({ tags }) => tags),
});
