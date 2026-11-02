import { applyDiscoveryEvent, type LiveChannelView } from "../domain/live-channel-view.ts";
import { DISCOVERY_EVENT_READERS, type PublishedEvent } from "./read-discovery-event.ts";

export type HistoryEvent = PublishedEvent & { readonly occurredAt: Date };

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

type Fold = {
  readonly views: ReadonlyMap<string, LiveChannelView>;
  readonly eventIds: readonly string[];
  readonly skipped: number;
};

const fold = (state: Fold, event: HistoryEvent): Fold => {
  const read = DISCOVERY_EVENT_READERS[event.name];
  if (read === undefined) {
    return state;
  }
  const decoded = read(event);
  if (decoded === null) {
    return { ...state, skipped: state.skipped + 1 };
  }
  const { channelId } = decoded;
  return {
    views: new Map([
      ...state.views,
      [channelId, applyDiscoveryEvent(state.views.get(channelId) ?? null, decoded)],
    ]),
    eventIds: [...state.eventIds, event.id],
    skipped: state.skipped,
  };
};

const readAll = async ({
  history,
  pageSize,
  state,
  after,
}: {
  history: OutboxHistory;
  pageSize: number;
  state: Fold;
  after: HistoryEvent | undefined;
}): Promise<Fold> => {
  const page = await history.page({ after, take: pageSize });
  const next = page.reduce(fold, state);
  const last = page.at(-1);
  return page.length < pageSize || last === undefined
    ? next
    : readAll({ history, pageSize, state: next, after: last });
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
  const { views, eventIds, skipped } = await store.replaceAll(async () => {
    const folded = await readAll({
      history,
      pageSize,
      state: { views: new Map(), eventIds: [], skipped: 0 },
      after: undefined,
    });
    return { ...folded, views: [...folded.views.values()] };
  });
  return { channels: views.length, events: eventIds.length, skipped };
};
