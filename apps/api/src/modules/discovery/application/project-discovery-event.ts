import { type AccountAvatarView, applyAccountAvatarEvent } from "../domain/account-avatar-view.ts";
import {
  applyCategoryFollowEvent,
  type CategoryFollowView,
} from "../domain/category-follow-view.ts";
import { applyCategoryEvent, type CategoryView } from "../domain/category-view.ts";
import {
  type DiscoveryEvent,
  isAccountAvatarEvent,
  isCategoryEvent,
  isCategoryFollowEvent,
} from "../domain/discovery-event.ts";
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

export interface CategoryFollowProjection {
  update(input: {
    eventId: string;
    userId: string;
    categoryId: string;
    change: (view: CategoryFollowView | null) => CategoryFollowView | null;
  }): Promise<void>;
}

export interface AccountAvatarProjection {
  update(input: {
    eventId: string;
    accountId: string;
    change: (view: AccountAvatarView | null) => AccountAvatarView;
  }): Promise<void>;
}

export const projectDiscoveryEvent =
  ({
    channels,
    categories,
    follows,
    avatars,
  }: {
    channels: LiveChannelProjection;
    categories: CategoryProjection;
    follows: CategoryFollowProjection;
    avatars: AccountAvatarProjection;
  }) =>
  ({ eventId, event }: { eventId: string; event: DiscoveryEvent }): Promise<void> => {
    if (isAccountAvatarEvent(event)) {
      return avatars.update({
        eventId,
        accountId: event.accountId,
        change: (view) => applyAccountAvatarEvent(view, event),
      });
    }
    if (isCategoryFollowEvent(event)) {
      return follows.update({
        eventId,
        userId: event.userId,
        categoryId: event.categoryId,
        change: (view) => applyCategoryFollowEvent(view, event),
      });
    }
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
