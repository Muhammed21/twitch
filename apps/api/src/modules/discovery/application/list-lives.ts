import type { ViewerCountReader } from "./live-status-viewers.ts";

export type LiveListItem = {
  readonly channelId: string;
  readonly slug: string;
  readonly title: string;
  readonly startedAt: Date;
  readonly viewerCount?: number;
};

export type LivePosition = {
  readonly startedAt: Date;
  readonly channelId: string;
};

export interface LiveReader {
  page(input: { after: LivePosition | undefined; take: number }): Promise<readonly LiveListItem[]>;
}

export type LivesPage = {
  readonly items: readonly LiveListItem[];
  readonly next: LivePosition | undefined;
};

export const listLives =
  (reader: LiveReader) =>
  async ({
    after,
    limit,
  }: {
    after: LivePosition | undefined;
    limit: number;
  }): Promise<LivesPage> => {
    const lives = await reader.page({ after, take: limit + 1 });
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

export type ListLives = (request: {
  after: LivePosition | undefined;
  limit: number;
}) => Promise<LivesPage>;

export const withLiveViewerCounts =
  ({
    lives,
    viewerCounts,
    onViewerCountFailure,
  }: {
    lives: ListLives;
    viewerCounts: ViewerCountReader;
    onViewerCountFailure: (error: unknown) => void;
  }): ListLives =>
  async (request) => {
    const page = await lives(request);
    if (page.items.length === 0) {
      return page;
    }
    const counts = await viewerCounts(page.items.map(({ channelId }) => channelId)).catch(
      (error: unknown) => {
        onViewerCountFailure(error);
        return undefined;
      },
    );
    if (counts === undefined) {
      return page;
    }
    return {
      ...page,
      items: page.items.map((live) => ({ ...live, viewerCount: counts.get(live.channelId) ?? 0 })),
    };
  };
