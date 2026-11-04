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

export interface CategoryFollowLookup {
  followerCountOf(categoryId: string): Promise<number>;
  isFollowing(pair: { userId: string; categoryId: string }): Promise<boolean>;
}

export type CategoryHeader = ResolvedCategory &
  CategoryAudienceCounts & {
    readonly followerCount: number;
    readonly isFollowing?: boolean;
  };

export type ReadCategoryHeader = (request: {
  slug: string;
  viewerId: string | undefined;
}) => Promise<Result<CategoryHeader, "category_not_found">>;

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
    follows,
  }: {
    categories: CategoryViewReader;
    audience: CategoryAudienceLookup;
    follows: CategoryFollowLookup;
  }): ReadCategoryHeader =>
  async ({ slug, viewerId }) => {
    const resolved = resolveSlug(await categories.aroundSlug(slug), slug);
    if (resolved === null) {
      return err("category_not_found");
    }
    const { categoryId } = resolved;
    const [counts, followerCount, viewer] = await Promise.all([
      audience.of(categoryId),
      follows.followerCountOf(categoryId),
      viewerId === undefined
        ? {}
        : follows.isFollowing({ userId: viewerId, categoryId }).then((isFollowing) => ({
            isFollowing,
          })),
    ]);
    return ok({ ...resolved, liveCount: 0, viewerCount: 0, ...counts, followerCount, ...viewer });
  };
