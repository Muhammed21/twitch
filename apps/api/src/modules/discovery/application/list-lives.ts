export type LiveListItem = {
  readonly channelId: string;
  readonly slug: string;
  readonly title: string;
  readonly startedAt: Date;
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
