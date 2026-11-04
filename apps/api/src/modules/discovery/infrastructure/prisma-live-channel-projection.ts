import { alreadyProcessed, type createContextClient } from "@repo/db";

import type {
  CategoryProjection,
  LiveChannelProjection,
} from "../application/project-discovery-event.ts";
import type { LiveChannelStore } from "../application/rebuild-live-channel-views.ts";
import { followerCounts } from "../domain/category-follow-view.ts";
import type { CategoryView } from "../domain/category-view.ts";
import type { LiveChannelView } from "../domain/live-channel-view.ts";

export type DiscoveryPrisma = ReturnType<typeof createContextClient>;

const HANDLER = "discovery.live-channel-view";
const PROCESSED_EVENTS = { schema: "discovery", table: "DiscoveryProcessedEvent" };

type ViewRow = {
  readonly channelId: string;
  readonly slug: string | null;
  readonly title: string;
  readonly titleChangedAt: Date | null;
  readonly categoryId: string | null;
  readonly liveSessionId: string | null;
  readonly liveStartedAt: Date | null;
  readonly lastEndedAt: Date | null;
};

const toView = (row: ViewRow): LiveChannelView => ({
  channelId: row.channelId,
  slug: row.slug,
  title: row.title,
  titleChangedAt: row.titleChangedAt,
  categoryId: row.categoryId,
  live:
    row.liveSessionId === null || row.liveStartedAt === null
      ? null
      : { sessionId: row.liveSessionId, startedAt: row.liveStartedAt },
  lastEndedAt: row.lastEndedAt,
});

const toRow = (view: LiveChannelView): ViewRow => ({
  channelId: view.channelId,
  slug: view.slug,
  title: view.title,
  titleChangedAt: view.titleChangedAt,
  categoryId: view.categoryId,
  liveSessionId: view.live?.sessionId ?? null,
  liveStartedAt: view.live?.startedAt ?? null,
  lastEndedAt: view.lastEndedAt,
});

export const prismaLiveChannelProjection = (prisma: DiscoveryPrisma): LiveChannelProjection => ({
  update: ({ eventId, channelId, change }) =>
    prisma.$transaction(async (tx) => {
      if (
        await alreadyProcessed(tx, {
          processedEvents: PROCESSED_EVENTS,
          eventId,
          handler: HANDLER,
        })
      ) {
        return;
      }
      await tx.$executeRaw`
        INSERT INTO "discovery"."DiscoveryLiveChannelView" ("channelId")
        VALUES (${channelId}::uuid)
        ON CONFLICT DO NOTHING
      `;
      const rows = await tx.$queryRaw<ViewRow[]>`
        SELECT "channelId"::text AS "channelId", "slug", "title", "titleChangedAt",
               "categoryId"::text AS "categoryId", "liveSessionId"::text AS "liveSessionId", "liveStartedAt", "lastEndedAt"
        FROM "discovery"."DiscoveryLiveChannelView"
        WHERE "channelId" = ${channelId}::uuid
        FOR UPDATE
      `;
      const [row] = rows;
      if (row === undefined) {
        throw new Error(`vue de la chaîne ${channelId} introuvable après insertion`);
      }
      await tx.discoveryLiveChannelView.update({
        where: { channelId },
        data: toRow(change(toView(row))),
      });
    }),
});

export const prismaCategoryProjection = (prisma: DiscoveryPrisma): CategoryProjection => ({
  update: ({ eventId, categoryId, change }) =>
    prisma.$transaction(async (tx) => {
      if (
        await alreadyProcessed(tx, {
          processedEvents: PROCESSED_EVENTS,
          eventId,
          handler: HANDLER,
        })
      ) {
        return;
      }
      await tx.$executeRaw`
        INSERT INTO "discovery"."DiscoveryCategoryView" ("categoryId")
        VALUES (${categoryId}::uuid)
        ON CONFLICT DO NOTHING
      `;
      const rows = await tx.$queryRaw<CategoryView[]>`
        SELECT "categoryId"::text AS "categoryId", "slug", "name", "status"::text AS "status",
               "mergedIntoId"::text AS "mergedIntoId", "imageKey", "tags"
        FROM "discovery"."DiscoveryCategoryView"
        WHERE "categoryId" = ${categoryId}::uuid
        FOR UPDATE
      `;
      const [row] = rows;
      if (row === undefined) {
        throw new Error(`vue de la catégorie ${categoryId} introuvable après insertion`);
      }
      const changed = change(row);
      await tx.discoveryCategoryView.update({
        where: { categoryId },
        data: { ...changed, tags: [...changed.tags] },
      });
    }),
});

const REBUILD_TIMEOUT_MS = 10 * 60 * 1000;
const INSERT_BATCH_SIZE = 1000;

const inBatches = <T>(items: readonly T[]): readonly (readonly T[])[] =>
  Array.from({ length: Math.ceil(items.length / INSERT_BATCH_SIZE) }, (_, index) =>
    items.slice(index * INSERT_BATCH_SIZE, (index + 1) * INSERT_BATCH_SIZE),
  );

const sequentially = <T>(batches: readonly T[], insert: (batch: T) => Promise<unknown>) =>
  batches.reduce<Promise<unknown>>(
    (previous, batch) => previous.then(() => insert(batch)),
    Promise.resolve(),
  );

export const prismaLiveChannelStore = (prisma: DiscoveryPrisma): LiveChannelStore => ({
  replaceAll: (compute) =>
    prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`
          LOCK TABLE "discovery"."DiscoveryLiveChannelView", "discovery"."DiscoveryCategoryView",
                     "discovery"."DiscoveryCategoryFollow", "discovery"."DiscoveryCategoryFollowerCount",
                     "discovery"."DiscoveryProcessedEvent"
          IN EXCLUSIVE MODE
        `;
        const projection = await compute();
        await tx.discoveryLiveChannelView.deleteMany();
        await tx.discoveryCategoryView.deleteMany();
        await tx.discoveryCategoryFollow.deleteMany();
        await tx.discoveryCategoryFollowerCount.deleteMany();
        await sequentially(inBatches(projection.views), (views) =>
          tx.discoveryLiveChannelView.createMany({ data: views.map(toRow) }),
        );
        await sequentially(inBatches(projection.categories), (categories) =>
          tx.discoveryCategoryView.createMany({
            data: categories.map((category) => ({ ...category, tags: [...category.tags] })),
          }),
        );
        await sequentially(inBatches(projection.follows), (follows) =>
          tx.discoveryCategoryFollow.createMany({ data: [...follows] }),
        );
        await sequentially(inBatches(followerCounts(projection.follows)), (counts) =>
          tx.discoveryCategoryFollowerCount.createMany({ data: [...counts] }),
        );
        await sequentially(inBatches(projection.eventIds), (eventIds) =>
          tx.discoveryProcessedEvent.createMany({
            data: eventIds.map((eventId) => ({ eventId, handlerName: HANDLER })),
            skipDuplicates: true,
          }),
        );
        return projection;
      },
      { timeout: REBUILD_TIMEOUT_MS, maxWait: REBUILD_TIMEOUT_MS },
    ),
});
