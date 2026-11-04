import { err, ok, type Result } from "@repo/result";

import {
  type CategoryView,
  type ResolvedCategory,
  resolveCategory,
} from "../domain/category-view.ts";
import type { ListLives, LivePosition, LivesPage } from "./list-lives.ts";
import type { CategoryTargets } from "./live-categories.ts";

export interface CategoryViewReader extends CategoryTargets {
  aroundSlug(slug: string): Promise<ReadonlyMap<string, CategoryView>>;
}

export type CategoryAudienceCounts = {
  readonly liveCount: number;
  readonly viewerCount: number;
};

export interface CategoryAudienceLookup {
  of(categoryId: string): Promise<CategoryAudienceCounts | null>;
}

export type CategoryHeader = ResolvedCategory & CategoryAudienceCounts;

export type ReadCategoryHeader = (
  slug: string,
) => Promise<Result<CategoryHeader, "category_not_found">>;

export type ListCategoryLives = (request: {
  slug: string;
  after: LivePosition | undefined;
  limit: number;
}) => Promise<Result<LivesPage, "category_not_found">>;

const resolveSlug = (
  views: ReadonlyMap<string, CategoryView>,
  slug: string,
): ResolvedCategory | null => {
  const named = [...views.values()].find((view) => view.slug === slug);
  return named === undefined ? null : resolveCategory(views, named.categoryId);
};

export const listCategoryLives =
  ({
    categories,
    lives,
  }: {
    categories: CategoryViewReader;
    lives: ListLives;
  }): ListCategoryLives =>
  async ({ slug, after, limit }) => {
    const views = await categories.aroundSlug(slug);
    const resolved = resolveSlug(views, slug);
    if (resolved === null) {
      return err("category_not_found");
    }
    const categoryIds = [...views.keys()].filter(
      (id) => resolveCategory(views, id)?.categoryId === resolved.categoryId,
    );
    return ok(await lives({ after, limit, categoryIds }));
  };

export const readCategoryHeader =
  ({
    categories,
    audience,
  }: {
    categories: CategoryViewReader;
    audience: CategoryAudienceLookup;
  }): ReadCategoryHeader =>
  async (slug) => {
    const resolved = resolveSlug(await categories.aroundSlug(slug), slug);
    if (resolved === null) {
      return err("category_not_found");
    }
    const counts = await audience.of(resolved.categoryId);
    return ok({ ...resolved, liveCount: 0, viewerCount: 0, ...counts });
  };
