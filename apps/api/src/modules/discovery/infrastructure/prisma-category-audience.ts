import { z } from "zod";

import type {
  AudiencePosition,
  CategoryAudienceReader,
  CategoryAudienceStore,
  LiveInCategorySource,
} from "../application/category-audience.ts";
import type { DiscoveryPrisma } from "./prisma-live-channel-projection.ts";

export const prismaLivesInCategory =
  (prisma: DiscoveryPrisma): LiveInCategorySource =>
  async ({ after, take }) =>
    (
      await prisma.discoveryLiveChannelView.findMany({
        where: {
          liveSessionId: { not: null },
          liveStartedAt: { not: null },
          slug: { not: null },
          categoryId: { not: null },
          ...(after === undefined ? {} : { channelId: { gt: after } }),
        },
        select: { channelId: true, categoryId: true },
        orderBy: { channelId: "asc" },
        take,
      })
    ).flatMap(({ channelId, categoryId }) =>
      categoryId === null ? [] : [{ channelId, categoryId }],
    );

export const prismaCategoryAudienceStore = (prisma: DiscoveryPrisma): CategoryAudienceStore => ({
  replace: async (audiences) => {
    const refreshedAt = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('discovery.category-audience'))`;
      await tx.discoveryCategoryAudience.deleteMany();
      await tx.discoveryCategoryAudience.createMany({
        data: audiences.map((audience) => ({ ...audience, refreshedAt })),
      });
    });
  },
});

const BrowsedRows = z.array(
  z.object({
    categoryId: z.string(),
    slug: z.string(),
    name: z.string(),
    imageKey: z.string().nullable(),
    liveCount: z.number(),
    viewerCount: z.number(),
  }),
);

const SEEK = `AND (a."viewerCount" < $2 OR (a."viewerCount" = $2 AND (a."liveCount" < $3
  OR (a."liveCount" = $3 AND a."categoryId" > $4::uuid))))`;

export const audiencePageQuery = ({
  after,
  take,
}: {
  after: AudiencePosition | undefined;
  take: number;
}): { text: string; values: readonly unknown[] } => ({
  text: `SELECT a."categoryId"::text AS "categoryId", v."slug", v."name", v."imageKey",
                a."liveCount", a."viewerCount"
           FROM "discovery"."DiscoveryCategoryAudience" a
           JOIN "discovery"."DiscoveryCategoryView" v ON v."categoryId" = a."categoryId"
          WHERE v."status" = 'active' AND v."slug" IS NOT NULL ${after === undefined ? "" : SEEK}
          ORDER BY a."viewerCount" DESC, a."liveCount" DESC, a."categoryId" ASC
          LIMIT $1`,
  values:
    after === undefined ? [take] : [take, after.viewerCount, after.liveCount, after.categoryId],
});

export const prismaCategoryAudienceReader = (prisma: DiscoveryPrisma): CategoryAudienceReader => ({
  page: async (request) => {
    const { text, values } = audiencePageQuery(request);
    return BrowsedRows.parse(await prisma.$queryRawUnsafe(text, ...values));
  },
});
