import type { ActiveCategoryTags } from "../application/category-tags.ts";
import type { DiscoveryPrisma } from "./prisma-live-channel-projection.ts";

export const MAX_TAGGED_CATEGORIES = 1000;

export const prismaActiveCategoryTags = ({
  prisma,
  limit,
}: {
  prisma: DiscoveryPrisma;
  limit: number;
}): ActiveCategoryTags => ({
  tagsOfActiveCategories: async () =>
    (
      await prisma.discoveryCategoryView.findMany({
        where: { status: "active", slug: { not: null }, tags: { isEmpty: false } },
        select: { tags: true },
        orderBy: { categoryId: "asc" },
        take: limit,
      })
    ).map(({ tags }) => tags),
});
