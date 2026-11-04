import type { CategoryEvent } from "./category-view.ts";
import type { LiveChannelEvent } from "./live-channel-view.ts";

export type DiscoveryEvent = LiveChannelEvent | CategoryEvent;

const CATEGORY_KINDS: ReadonlySet<DiscoveryEvent["kind"]> = new Set([
  "category-created",
  "category-merged",
  "category-retired",
]);

export const isCategoryEvent = (event: DiscoveryEvent): event is CategoryEvent =>
  CATEGORY_KINDS.has(event.kind);
