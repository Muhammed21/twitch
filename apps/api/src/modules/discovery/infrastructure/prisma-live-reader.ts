import { z } from "zod";

import type { LivePosition, LiveReader } from "../application/list-lives.ts";
import type { CategoryTargets } from "../application/live-categories.ts";
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

const MAX_MERGE_HOPS = 16;

type Views = ReadonlyMap<string, CategoryView>;

const withRows = (views: Views, rows: readonly CategoryView[]): Views =>
  new Map([...views, ...rows.map((row): [string, CategoryView] => [row.categoryId, row])]);

const followTargets = async (
  prisma: DiscoveryPrisma,
  frontier: readonly string[],
  views: Views,
  hops = 0,
): Promise<Views> => {
  const missing = frontier.filter((id) => !views.has(id));
  if (missing.length === 0 || hops > MAX_MERGE_HOPS) {
    return views;
  }
  const rows: readonly CategoryView[] = await prisma.discoveryCategoryView.findMany({
    where: { categoryId: { in: [...missing] } },
    take: missing.length,
  });
  return followTargets(
    prisma,
    rows.flatMap(({ mergedIntoId }) => (mergedIntoId === null ? [] : [mergedIntoId])),
    withRows(views, rows),
    hops + 1,
  );
};

export const prismaCategoryViewReader = (prisma: DiscoveryPrisma): CategoryTargets => ({
  withMergeTargets: (categoryIds) => followTargets(prisma, categoryIds, new Map()),
});
