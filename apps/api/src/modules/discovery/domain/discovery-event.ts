import type { CategoryFollowEvent } from "./category-follow-view.ts";
import type { CategoryEvent } from "./category-view.ts";
import type { LiveChannelEvent } from "./live-channel-view.ts";

export type DiscoveryEvent = LiveChannelEvent | CategoryEvent | CategoryFollowEvent;

const CATEGORY_KINDS: ReadonlySet<DiscoveryEvent["kind"]> = new Set([
  "category-created",
  "category-merged",
  "category-retired",
  "category-updated",
]);

export const isCategoryEvent = (event: DiscoveryEvent): event is CategoryEvent =>
  CATEGORY_KINDS.has(event.kind);

export const isCategoryFollowEvent = (event: DiscoveryEvent): event is CategoryFollowEvent =>
  event.kind === "category-follow-changed";
