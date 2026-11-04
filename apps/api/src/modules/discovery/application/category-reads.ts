import { err, ok, type Result } from "@repo/result";

import { type CategoryView, resolveCategory } from "../domain/category-view.ts";
import type { ListLives, LivePosition, LivesPage } from "./list-lives.ts";
import type { CategoryTargets } from "./live-categories.ts";

export interface CategoryViewReader extends CategoryTargets {
  aroundSlug(slug: string): Promise<ReadonlyMap<string, CategoryView>>;
}

export type ListCategoryLives = (request: {
  slug: string;
  after: LivePosition | undefined;
  limit: number;
}) => Promise<Result<LivesPage, "category_not_found">>;

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
    const named = [...views.values()].find((view) => view.slug === slug);
    const resolved = named === undefined ? null : resolveCategory(views, named.categoryId);
    if (resolved === null) {
      return err("category_not_found");
    }
    const categoryIds = [...views.keys()].filter(
      (id) => resolveCategory(views, id)?.categoryId === resolved.categoryId,
    );
    return ok(await lives({ after, limit, categoryIds }));
  };
