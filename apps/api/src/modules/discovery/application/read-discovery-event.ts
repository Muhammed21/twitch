import type { z } from "zod";

import { events } from "@repo/contracts";

import type { DiscoveryEvent } from "../domain/discovery-event.ts";

export type PublishedEvent = {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly payload: unknown;
  readonly occurredAt: Date;
};

type Contract<T extends z.ZodType> = {
  readonly name: string;
  readonly version: number;
  readonly payload: T;
};

const reader =
  <T extends z.ZodType>(
    contract: Contract<T>,
    toEvent: (payload: z.infer<T>, event: PublishedEvent) => DiscoveryEvent,
  ) =>
  (event: PublishedEvent): DiscoveryEvent | null => {
    if (event.version !== contract.version) {
      throw new Error(`${event.name} version ${event.version} non gérée`);
    }
    const payload = contract.payload.safeParse(event.payload);
    return payload.success ? toEvent(payload.data, event) : null;
  };

const {
  channelCreated,
  channelMetadataUpdated,
  channelCategoryCreated,
  channelCategoryMerged,
  channelCategoryRetired,
  channelCategoryUpdated,
} = events.channel;
const { streamStarted, streamEnded } = events.stream;

export const DISCOVERY_EVENT_READERS: Readonly<
  Record<string, (event: PublishedEvent) => DiscoveryEvent | null>
> = {
  [channelCreated.name]: reader(channelCreated, ({ channelId, slug }) => ({
    kind: "channel-created",
    channelId,
    slug,
  })),
  [channelMetadataUpdated.name]: reader(
    channelMetadataUpdated,
    ({ channelId, title, categoryId }, { occurredAt }) => ({
      kind: "metadata-changed",
      channelId,
      title,
      categoryId,
      changedAt: occurredAt,
    }),
  ),
  [channelCategoryCreated.name]: reader(channelCategoryCreated, ({ categoryId, slug, name }) => ({
    kind: "category-created",
    categoryId,
    slug,
    name,
  })),
  [channelCategoryMerged.name]: reader(
    channelCategoryMerged,
    ({ sourceCategoryId, targetCategoryId }) => ({
      kind: "category-merged",
      categoryId: sourceCategoryId,
      targetCategoryId,
    }),
  ),
  [channelCategoryRetired.name]: reader(channelCategoryRetired, ({ categoryId }) => ({
    kind: "category-retired",
    categoryId,
  })),
  [channelCategoryUpdated.name]: reader(
    channelCategoryUpdated,
    ({ categoryId, name, imageKey, tags }) => ({
      kind: "category-updated",
      categoryId,
      name,
      imageKey,
      tags,
    }),
  ),
  [streamStarted.name]: reader(streamStarted, ({ channelId, sessionId, startedAt }) => ({
    kind: "stream-started",
    channelId,
    sessionId,
    startedAt: new Date(startedAt),
  })),
  [streamEnded.name]: reader(streamEnded, ({ channelId, sessionId, endedAt }) => ({
    kind: "stream-ended",
    channelId,
    sessionId,
    endedAt: new Date(endedAt),
  })),
};
