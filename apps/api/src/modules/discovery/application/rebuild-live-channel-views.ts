import { applyDiscoveryEvent, type LiveChannelView } from "../domain/live-channel-view.ts";
import { DISCOVERY_EVENT_READERS, type PublishedEvent } from "./read-discovery-event.ts";

export type HistoryEvent = PublishedEvent;

export interface OutboxHistory {
  page(input: { after: HistoryEvent | undefined; take: number }): Promise<readonly HistoryEvent[]>;
}

export type RebuiltProjection = {
  readonly views: readonly LiveChannelView[];
  readonly eventIds: readonly string[];
  readonly skipped: number;
};

export interface LiveChannelStore {
  replaceAll(compute: () => Promise<RebuiltProjection>): Promise<RebuiltProjection>;
}

export type RebuildReport = {
  readonly channels: number;
  readonly events: number;
  readonly skipped: number;
};

type Accumulator = {
  readonly views: Map<string, LiveChannelView>;
  readonly eventIds: string[];
  readonly skippedIds: string[];
};

const foldInto =
  (accumulator: Accumulator) =>
  (event: HistoryEvent): void => {
    const read = DISCOVERY_EVENT_READERS[event.name];
    if (read === undefined) {
      return;
    }
    const decoded = read(event);
    if (decoded === null) {
      accumulator.skippedIds.push(event.id);
      return;
    }
    const { channelId } = decoded;
    accumulator.views.set(
      channelId,
      applyDiscoveryEvent(accumulator.views.get(channelId) ?? null, decoded),
    );
    accumulator.eventIds.push(event.id);
  };

const readAll = async ({
  history,
  pageSize,
  accumulator,
  after,
}: {
  history: OutboxHistory;
  pageSize: number;
  accumulator: Accumulator;
  after: HistoryEvent | undefined;
}): Promise<void> => {
  const page = await history.page({ after, take: pageSize });
  page.forEach(foldInto(accumulator));
  const last = page.at(-1);
  if (page.length < pageSize || last === undefined) {
    return;
  }
  await readAll({ history, pageSize, accumulator, after: last });
};

const project = async (history: OutboxHistory, pageSize: number): Promise<RebuiltProjection> => {
  const accumulator: Accumulator = { views: new Map(), eventIds: [], skippedIds: [] };
  await readAll({ history, pageSize, accumulator, after: undefined });
  return {
    views: [...accumulator.views.values()],
    eventIds: accumulator.eventIds,
    skipped: accumulator.skippedIds.length,
  };
};

export const rebuildLiveChannelViews = async ({
  history,
  store,
  pageSize,
}: {
  history: OutboxHistory;
  store: LiveChannelStore;
  pageSize: number;
}): Promise<RebuildReport> => {
  const { views, eventIds, skipped } = await store.replaceAll(() => project(history, pageSize));
  return { channels: views.length, events: eventIds.length, skipped };
};
