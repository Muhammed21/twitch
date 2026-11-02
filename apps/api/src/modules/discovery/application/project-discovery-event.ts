import {
  applyDiscoveryEvent,
  type DiscoveryEvent,
  type LiveChannelView,
} from "../domain/live-channel-view.ts";

export interface LiveChannelProjection {
  update(input: {
    eventId: string;
    channelId: string;
    change: (view: LiveChannelView) => LiveChannelView;
  }): Promise<void>;
}

export const projectDiscoveryEvent =
  (projection: LiveChannelProjection) =>
  ({ eventId, event }: { eventId: string; event: DiscoveryEvent }): Promise<void> =>
    projection.update({
      eventId,
      channelId: event.channelId,
      change: (view) => applyDiscoveryEvent(view, event),
    });
