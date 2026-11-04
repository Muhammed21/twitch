import { z } from "zod";

import type { CategoryViewReader, LiveCategory } from "../application/category-reads.ts";
import type { LivePosition, LiveReader } from "../application/list-lives.ts";
import type { CategoryView } from "../domain/category-view.ts";
import type { DiscoveryPrisma } from "./prisma-live-channel-projection.ts";

const LiveRows = z.array(
  z.object({
    channelId: z.string(),
    slug: z.string(),
    title: z.string(),
    startedAt: z.date(),
    categoryId: z.string().nullable(),
  }),
);

const LiveCategoryRows = z.array(z.object({ channelId: z.string(), categoryId: z.string() }));

const LIVE = `"liveSessionId" IS NOT NULL AND "liveStartedAt" IS NOT NULL AND "slug" IS NOT NULL`;

const SEEK = `AND "liveStartedAt" <= ($2::timestamptz AT TIME ZONE 'UTC')
  AND ("liveStartedAt" < ($2::timestamptz AT TIME ZONE 'UTC') OR "channelId" > $3::uuid)`;

export const livePageQuery = ({
  after,
  take,
  categoryIds,
}: {
  after: LivePosition | undefined;
  take: number;
  categoryIds?: readonly string[];
}): { text: string; values: readonly unknown[] } => {
  const values =
    after === undefined ? [take] : [take, after.startedAt.toISOString(), after.channelId];
  const inCategories =
    categoryIds === undefined ? "" : `AND "categoryId" = ANY($${values.length + 1}::uuid[])`;
  return {
    text: `SELECT "channelId"::text AS "channelId", "slug", "title",
                  "liveStartedAt" AT TIME ZONE 'UTC' AS "startedAt", "categoryId"::text AS "categoryId"
             FROM "discovery"."DiscoveryLiveChannelView"
            WHERE ${LIVE} ${after === undefined ? "" : SEEK} ${inCategories}
            ORDER BY "liveStartedAt" DESC, "channelId" ASC
            LIMIT $1`,
    values: categoryIds === undefined ? values : [...values, [...categoryIds]],
  };
};

export const prismaLiveReader = (prisma: DiscoveryPrisma): LiveReader => ({
  page: async (request) => {
    const { text, values } = livePageQuery(request);
    return LiveRows.parse(await prisma.$queryRawUnsafe(text, ...values));
  },
});

export const prismaLiveCategories =
  (prisma: DiscoveryPrisma) => async (): Promise<readonly LiveCategory[]> =>
    LiveCategoryRows.parse(
      await prisma.$queryRawUnsafe(
        `SELECT "channelId"::text AS "channelId", "categoryId"::text AS "categoryId"
           FROM "discovery"."DiscoveryLiveChannelView"
          WHERE ${LIVE} AND "categoryId" IS NOT NULL`,
      ),
    );

export const prismaCategoryViewReader = (prisma: DiscoveryPrisma): CategoryViewReader => ({
  all: async () => {
    const rows: readonly CategoryView[] = await prisma.discoveryCategoryView.findMany();
    return new Map(rows.map((row) => [row.categoryId, row]));
  },
});
