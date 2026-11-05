import { resolveCategory } from "../domain/category-view.ts";
import { type CategoryTargets, distinctCategoryIds } from "./live-categories.ts";
import type { ViewerCountReader } from "./live-status-viewers.ts";

export type LiveInCategory = {
  readonly channelId: string;
  readonly categoryId: string;
};

export type LiveInCategorySource = (request: {
  after: string | undefined;
  take: number;
}) => Promise<readonly LiveInCategory[]>;

export type CategoryAudience = {
  readonly categoryId: string;
  readonly liveCount: number;
  readonly viewerCount: number;
};

export interface CategoryAudienceStore {
  replace(audiences: readonly CategoryAudience[]): Promise<void>;
}

type Audiences = ReadonlyMap<string, CategoryAudience>;

const withBatch = async ({
  audiences,
  batch,
  categories,
  viewerCounts,
}: {
  audiences: Audiences;
  batch: readonly LiveInCategory[];
  categories: CategoryTargets;
  viewerCounts: ViewerCountReader;
}): Promise<Audiences> => {
  const views = await categories.withMergeTargets(
    distinctCategoryIds(batch.map(({ categoryId }) => categoryId)),
  );
  const counts = await viewerCounts(batch.map(({ channelId }) => channelId));
  return batch.reduce<Audiences>((current, { channelId, categoryId }) => {
    const resolved = resolveCategory(views, categoryId);
    if (resolved === null) {
      return current;
    }
    const previous = current.get(resolved.categoryId);
    return new Map([
      ...current,
      [
        resolved.categoryId,
        {
          categoryId: resolved.categoryId,
          liveCount: (previous?.liveCount ?? 0) + 1,
          viewerCount: (previous?.viewerCount ?? 0) + (counts.get(channelId) ?? 0),
        },
      ],
    ]);
  }, audiences);
};

export const refreshCategoryAudience = ({
  lives,
  categories,
  viewerCounts,
  store,
  batchSize,
}: {
  lives: LiveInCategorySource;
  categories: CategoryTargets;
  viewerCounts: ViewerCountReader;
  store: CategoryAudienceStore;
  batchSize: number;
}): (() => Promise<void>) => {
  const collect = async (after: string | undefined, audiences: Audiences): Promise<Audiences> => {
    const batch = await lives({ after, take: batchSize });
    const last = batch.at(-1);
    if (last === undefined) {
      return audiences;
    }
    const counted = await withBatch({ audiences, batch, categories, viewerCounts });
    return batch.length < batchSize ? counted : collect(last.channelId, counted);
  };
  return async () => {
    await store.replace([...(await collect(undefined, new Map())).values()]);
  };
};

export type AudiencePosition = {
  readonly viewerCount: number;
  readonly liveCount: number;
  readonly categoryId: string;
};

export type BrowsedCategory = AudiencePosition & {
  readonly slug: string;
  readonly name: string;
  readonly imageKey: string | null;
  readonly tags: readonly string[];
};

export interface CategoryAudienceReader {
  page(request: {
    after: AudiencePosition | undefined;
    take: number;
  }): Promise<readonly BrowsedCategory[]>;
}

export type BrowsePage = {
  readonly items: readonly BrowsedCategory[];
  readonly next: AudiencePosition | undefined;
};

export type BrowseCategories = (request: {
  after: AudiencePosition | undefined;
  limit: number;
}) => Promise<BrowsePage>;

export const browseCategories =
  (reader: CategoryAudienceReader): BrowseCategories =>
  async ({ after, limit }) => {
    const rows = await reader.page({ after, take: limit + 1 });
    const items = rows.slice(0, limit);
    const last = rows.length > limit ? items.at(-1) : undefined;
    return {
      items,
      next:
        last === undefined
          ? undefined
          : {
              viewerCount: last.viewerCount,
              liveCount: last.liveCount,
              categoryId: last.categoryId,
            },
    };
  };
