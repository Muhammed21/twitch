import { type CategoryView, resolveCategory } from "../domain/category-view.ts";
import type { ListLives } from "./list-lives.ts";

export interface CategoryTargets {
  withMergeTargets(categoryIds: readonly string[]): Promise<ReadonlyMap<string, CategoryView>>;
}

export const distinctCategoryIds = (ids: readonly (string | null)[]): readonly string[] => [
  ...new Set(ids.filter((id) => id !== null)),
];

export const withLiveCategories =
  ({ lives, categories }: { lives: ListLives; categories: CategoryTargets }): ListLives =>
  async (request) => {
    const page = await lives(request);
    if (page.items.length === 0) {
      return page;
    }
    const views = await categories.withMergeTargets(
      distinctCategoryIds(page.items.map(({ categoryId }) => categoryId)),
    );
    return {
      ...page,
      items: page.items.map((live) => {
        const resolved = live.categoryId === null ? null : resolveCategory(views, live.categoryId);
        return resolved === null
          ? live
          : { ...live, category: { slug: resolved.slug, name: resolved.name } };
      }),
    };
  };
