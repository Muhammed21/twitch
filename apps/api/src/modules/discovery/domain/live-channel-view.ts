export type LiveSession = {
  readonly sessionId: string;
  readonly startedAt: Date;
};

export type LiveChannelView = {
  readonly channelId: string;
  readonly slug: string | null;
  readonly title: string;
  readonly titleChangedAt: Date | null;
  readonly live: LiveSession | null;
  readonly lastEndedAt: Date | null;
};

export type DiscoveryEvent =
  | { readonly kind: "channel-created"; readonly channelId: string; readonly slug: string }
  | {
      readonly kind: "title-changed";
      readonly channelId: string;
      readonly title: string;
      readonly changedAt: Date;
    }
  | {
      readonly kind: "stream-started";
      readonly channelId: string;
      readonly sessionId: string;
      readonly startedAt: Date;
    }
  | {
      readonly kind: "stream-ended";
      readonly channelId: string;
      readonly sessionId: string;
      readonly endedAt: Date;
    };

const unknownChannel = (channelId: string): LiveChannelView => ({
  channelId,
  slug: null,
  title: "",
  titleChangedAt: null,
  live: null,
  lastEndedAt: null,
});

const isAfter = (instant: Date, reference: Date | null): boolean =>
  reference === null || instant.getTime() > reference.getTime();

const later = (current: Date | null, candidate: Date): Date =>
  current === null || isAfter(candidate, current) ? candidate : current;

const startsAfter = (view: LiveChannelView, startedAt: Date): boolean =>
  isAfter(startedAt, view.live?.startedAt ?? null) && isAfter(startedAt, view.lastEndedAt);

export const applyDiscoveryEvent = (
  current: LiveChannelView | null,
  event: DiscoveryEvent,
): LiveChannelView => {
  const view = current ?? unknownChannel(event.channelId);
  switch (event.kind) {
    case "channel-created":
      return { ...view, slug: event.slug };
    case "title-changed":
      return isAfter(event.changedAt, view.titleChangedAt)
        ? { ...view, title: event.title, titleChangedAt: event.changedAt }
        : view;
    case "stream-started":
      return startsAfter(view, event.startedAt)
        ? { ...view, live: { sessionId: event.sessionId, startedAt: event.startedAt } }
        : view;
    case "stream-ended":
      return {
        ...view,
        live: view.live?.sessionId === event.sessionId ? null : view.live,
        lastEndedAt: later(view.lastEndedAt, event.endedAt),
      };
  }
};
