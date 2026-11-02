import type { LiveListItem, LivePosition, LiveReader } from "../application/list-lives.ts";
import type { DiscoveryPrisma } from "./prisma-live-channel-projection.ts";

const LIVE = `"liveSessionId" IS NOT NULL AND "liveStartedAt" IS NOT NULL AND "slug" IS NOT NULL`;

const SEEK = `AND "liveStartedAt" <= ($2::timestamptz AT TIME ZONE 'UTC')
  AND ("liveStartedAt" < ($2::timestamptz AT TIME ZONE 'UTC') OR "channelId" > $3::uuid)`;

export const livePageQuery = ({
  after,
  take,
}: {
  after: LivePosition | undefined;
  take: number;
}): { text: string; values: readonly unknown[] } => ({
  text: `SELECT "channelId"::text AS "channelId", "slug", "title",
                "liveStartedAt" AT TIME ZONE 'UTC' AS "startedAt"
           FROM "discovery"."DiscoveryLiveChannelView"
          WHERE ${LIVE} ${after === undefined ? "" : SEEK}
          ORDER BY "liveStartedAt" DESC, "channelId" ASC
          LIMIT $1`,
  values: after === undefined ? [take] : [take, after.startedAt.toISOString(), after.channelId],
});

export const prismaLiveReader = (prisma: DiscoveryPrisma): LiveReader => ({
  page: ({ after, take }) => {
    const { text, values } = livePageQuery({ after, take });
    return prisma.$queryRawUnsafe<LiveListItem[]>(text, ...values);
  },
});
