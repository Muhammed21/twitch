import { err, ok, type Result } from "@repo/result";

import { type CategoryView, resolveCategory } from "../domain/category-view.ts";
import type { ListLives, LivePosition, LivesPage } from "./list-lives.ts";
import { type CategoryTargets, distinctCategoryIds } from "./live-categories.ts";
import { readViewerCounts, type ViewerCountSource } from "./live-status-viewers.ts";

export interface CategoryViewReader extends CategoryTargets {
  aroundSlug(slug: string): Promise<ReadonlyMap<string, CategoryView>>;
}

export type LiveCategory = {
  readonly channelId: string;
  readonly categoryId: string;
};

export type BrowsedCategory = {
  readonly slug: string;
  readonly name: string;
  readonly liveCount: number;
  readonly viewerCount?: number;
};

export type BrowseCategories = () => Promise<readonly BrowsedCategory[]>;

export type ListCategoryLives = (request: {
  slug: string;
  after: LivePosition | undefined;
  limit: number;
}) => Promise<Result<LivesPage, "category_not_found">>;

type Group = {
  readonly slug: string;
  readonly name: string;
  readonly channelIds: readonly string[];
};

const groupByCategory = (
  views: ReadonlyMap<string, CategoryView>,
  lives: readonly LiveCategory[],
): readonly Group[] => [
  ...lives
    .reduce<ReadonlyMap<string, Group>>((groups, { channelId, categoryId }) => {
      const resolved = resolveCategory(views, categoryId);
      if (resolved === null) {
        return groups;
      }
      const group = groups.get(resolved.categoryId);
      return new Map([
        ...groups,
        [
          resolved.categoryId,
          {
            slug: resolved.slug,
            name: resolved.name,
            channelIds: [...(group?.channelIds ?? []), channelId],
          },
        ],
      ]);
    }, new Map())
    .values(),
];

const byAudience = (left: BrowsedCategory, right: BrowsedCategory): number =>
  (right.viewerCount ?? 0) - (left.viewerCount ?? 0) ||
  right.liveCount - left.liveCount ||
  left.name.localeCompare(right.name, "fr");

export const browseCategories =
  ({
    liveCategories,
    categories,
    ...source
  }: {
    liveCategories: () => Promise<readonly LiveCategory[]>;
    categories: CategoryTargets;
  } & ViewerCountSource): BrowseCategories =>
  async () => {
    const lives = await liveCategories();
    const views = await categories.withMergeTargets(
      distinctCategoryIds(lives.map(({ categoryId }) => categoryId)),
    );
    const groups = groupByCategory(views, lives);
    const counts = await readViewerCounts(
      source,
      lives.map(({ channelId }) => channelId),
    );
    return groups
      .map(({ slug, name, channelIds }) => ({
        slug,
        name,
        liveCount: channelIds.length,
        ...(counts === undefined
          ? {}
          : {
              viewerCount: channelIds.reduce((sum, id) => sum + (counts.get(id) ?? 0), 0),
            }),
      }))
      .toSorted(byAudience);
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
