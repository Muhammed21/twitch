export type DanglingLive = {
  readonly sessionId: string;
  readonly channelId: string;
  readonly startedAt: Date;
};

export type DanglingLiveEnding = {
  readonly live: DanglingLive;
  readonly endedAt: Date;
  readonly outboxEventId: string;
};

export interface DanglingLives {
  list(): Promise<readonly DanglingLive[]>;
  end(ending: DanglingLiveEnding): Promise<void>;
}

const notBefore = (instant: Date, start: Date): Date =>
  instant.getTime() < start.getTime() ? start : instant;

export const endDanglingLives =
  ({ lives, now, newId }: { lives: DanglingLives; now: () => Date; newId: () => string }) =>
  async (): Promise<readonly DanglingLive[]> => {
    const dangling = await lives.list();
    await dangling.reduce(async (previous, live) => {
      await previous;
      await lives.end({ live, endedAt: notBefore(now(), live.startedAt), outboxEventId: newId() });
    }, Promise.resolve());
    return dangling;
  };
