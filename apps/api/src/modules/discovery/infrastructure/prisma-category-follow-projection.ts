import { alreadyProcessed } from "@repo/db";

import type { CategoryFollowLookup } from "../application/category-reads.ts";
import type { CategoryFollowProjection } from "../application/project-discovery-event.ts";
import { followerDelta } from "../domain/category-follow-view.ts";
import type { DiscoveryPrisma } from "./prisma-live-channel-projection.ts";

const HANDLER = "discovery.category-follow";
const PROCESSED_EVENTS = { schema: "discovery", table: "DiscoveryProcessedEvent" };

type PairRow = { readonly following: boolean; readonly version: number };

export const prismaCategoryFollowProjection = (
  prisma: DiscoveryPrisma,
): CategoryFollowProjection => ({
  update: ({ eventId, userId, categoryId, change }) =>
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
        INSERT INTO "discovery"."DiscoveryCategoryFollow" ("userId", "categoryId", "following", "version")
        VALUES (${userId}::uuid, ${categoryId}::uuid, false, 0)
        ON CONFLICT DO NOTHING
      `;
      const [row] = await tx.$queryRaw<PairRow[]>`
        SELECT "following", "version"
        FROM "discovery"."DiscoveryCategoryFollow"
        WHERE "userId" = ${userId}::uuid AND "categoryId" = ${categoryId}::uuid
        FOR UPDATE
      `;
      if (row === undefined) {
        throw new Error(`paire ${userId} / ${categoryId} introuvable après insertion`);
      }
      const current = { userId, categoryId, ...row };
      const next = change(current);
      if (next === null) {
        return;
      }
      await tx.discoveryCategoryFollow.update({
        where: { userId_categoryId: { userId, categoryId } },
        data: { following: next.following, version: next.version },
      });
      await tx.$executeRaw`
        INSERT INTO "discovery"."DiscoveryCategoryFollowerCount" ("categoryId", "followerCount")
        VALUES (${categoryId}::uuid, ${followerDelta(current, next)})
        ON CONFLICT ("categoryId") DO UPDATE
          SET "followerCount" = "DiscoveryCategoryFollowerCount"."followerCount" + EXCLUDED."followerCount"
      `;
    }),
});

export const prismaCategoryFollowLookup = (prisma: DiscoveryPrisma): CategoryFollowLookup => ({
  followerCountOf: async (categoryId) =>
    (
      await prisma.discoveryCategoryFollowerCount.findUnique({
        where: { categoryId },
        select: { followerCount: true },
      })
    )?.followerCount ?? 0,
  isFollowing: async ({ userId, categoryId }) =>
    (await prisma.discoveryCategoryFollow.count({
      where: { userId, categoryId, following: true },
    })) > 0,
});
