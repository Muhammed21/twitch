import { readViewerCounts, type ViewerCountSource } from "./live-status-viewers.ts";

export type LiveListItem = {
  readonly channelId: string;
  readonly slug: string;
  readonly title: string;
  readonly startedAt: Date;
};

export type ListedLive = LiveListItem & { readonly viewerCount?: number };

export type LivePosition = {
  readonly startedAt: Date;
  readonly channelId: string;
};

export interface LiveReader {
  page(input: { after: LivePosition | undefined; take: number }): Promise<readonly LiveListItem[]>;
}

export type LivesPage = {
  readonly items: readonly ListedLive[];
  readonly next: LivePosition | undefined;
};

export type ListLives = (request: {
  after: LivePosition | undefined;
  limit: number;
}) => Promise<LivesPage>;

export const listLives =
  (reader: LiveReader): ListLives =>
  async ({ after, limit }) => {
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
