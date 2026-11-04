import { applyCategoryEvent, type CategoryView } from "../domain/category-view.ts";
import { type DiscoveryEvent, isCategoryEvent } from "../domain/discovery-event.ts";
import { applyDiscoveryEvent, type LiveChannelView } from "../domain/live-channel-view.ts";

export interface LiveChannelProjection {
  update(input: {
    eventId: string;
    channelId: string;
    change: (view: LiveChannelView) => LiveChannelView;
  }): Promise<void>;
}

export interface CategoryProjection {
  update(input: {
    eventId: string;
    categoryId: string;
    change: (view: CategoryView) => CategoryView;
  }): Promise<void>;
}

export const projectDiscoveryEvent =
  ({ channels, categories }: { channels: LiveChannelProjection; categories: CategoryProjection }) =>
  ({ eventId, event }: { eventId: string; event: DiscoveryEvent }): Promise<void> => {
    if (isCategoryEvent(event)) {
      return categories.update({
        eventId,
        categoryId: event.categoryId,
        change: (view) => applyCategoryEvent(view, event),
      });
    }
    return channels.update({
      eventId,
      channelId: event.channelId,
      change: (view) => applyDiscoveryEvent(view, event),
    });
  };
