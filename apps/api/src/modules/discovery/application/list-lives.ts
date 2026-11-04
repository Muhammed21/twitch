import { readViewerCounts, type ViewerCountSource } from "./live-status-viewers.ts";

export type LiveListItem = {
  readonly channelId: string;
  readonly slug: string;
  readonly title: string;
  readonly startedAt: Date;
  readonly categoryId: string | null;
};

export type ListedCategory = {
  readonly slug: string;
  readonly name: string;
  readonly imageKey: string | null;
};

export type ListedLive = LiveListItem & {
  readonly viewerCount?: number;
  readonly thumbnailUrl?: string;
  readonly category?: ListedCategory;
};

export type ThumbnailUrlReader = (
  channelIds: readonly string[],
) => Promise<ReadonlyMap<string, string>>;

export type LivePosition = {
  readonly startedAt: Date;
  readonly channelId: string;
};

export interface LiveReader {
  page(input: {
    after: LivePosition | undefined;
    take: number;
    categoryIds?: readonly string[];
  }): Promise<readonly LiveListItem[]>;
}

export type LivesPage = {
  readonly items: readonly ListedLive[];
  readonly next: LivePosition | undefined;
};

export type LivesRequest = {
  readonly after: LivePosition | undefined;
  readonly limit: number;
  readonly categoryIds?: readonly string[];
};

export type ListLives = (request: LivesRequest) => Promise<LivesPage>;

export const listLives =
  (reader: LiveReader): ListLives =>
  async ({ after, limit, categoryIds }) => {
    const lives = await reader.page({ after, take: limit + 1, categoryIds });
    const items = lives.slice(0, limit);
    const last = items.at(-1);
    return {
      items,
      next:
        lives.length > limit && last !== undefined
          ? { startedAt: last.startedAt, channelId: last.channelId }
          : undefined,
    };
  };

export const withLiveViewerCounts =
  ({ lives, ...source }: { lives: ListLives } & ViewerCountSource): ListLives =>
  async (request) => {
    const page = await lives(request);
    if (page.items.length === 0) {
      return page;
    }
    const counts = await readViewerCounts(
      source,
      page.items.map(({ channelId }) => channelId),
    );
    if (counts === undefined) {
      return page;
    }
    return {
      ...page,
      items: page.items.map((live) => ({ ...live, viewerCount: counts.get(live.channelId) ?? 0 })),
    };
  };

export const withLiveThumbnails =
  ({
    lives,
    thumbnailUrls,
    onThumbnailFailure,
  }: {
    lives: ListLives;
    thumbnailUrls: ThumbnailUrlReader;
    onThumbnailFailure: (error: unknown) => void;
  }): ListLives =>
  async (request) => {
    const page = await lives(request);
    if (page.items.length === 0) {
      return page;
    }
    const urls = await thumbnailUrls(page.items.map(({ channelId }) => channelId)).catch(
      (error: unknown) => {
        onThumbnailFailure(error);
        return new Map<string, string>();
      },
    );
    return {
      ...page,
      items: page.items.map((live) => {
        const thumbnailUrl = urls.get(live.channelId);
        return thumbnailUrl === undefined ? live : { ...live, thumbnailUrl };
      }),
    };
  };
