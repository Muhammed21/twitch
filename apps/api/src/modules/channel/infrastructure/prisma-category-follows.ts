import type { z } from "zod";

import { events } from "@repo/contracts";
import { appendToOutbox } from "@repo/db";
import { err, ok } from "@repo/result";

import type { CategoryStatus } from "../application/category-admin.ts";
import type { CategoryFollows } from "../application/category-follow.ts";
import type { CategoryFollowPair } from "../domain/category-follow.ts";
import type { ChannelPrisma } from "./prisma-channel-registry.ts";

const OUTBOX = { schema: "channel", table: "ChannelOutbox" };

const { channelCategoryFollowed, channelCategoryUnfollowed } = events.channel;

type Transaction = Parameters<Parameters<ChannelPrisma["$transaction"]>[0]>[0];

type SharedRow = { readonly id: string; readonly status: CategoryStatus };

const shareBySlug = (tx: Transaction, slug: string) =>
  tx.$queryRaw<SharedRow[]>`
    SELECT "id"::text AS "id", "status"::text AS "status"
    FROM "channel"."ChannelCategory"
    WHERE "slug" = ${slug}
    FOR SHARE
  `;

const shareMergeTarget = (tx: Transaction, sourceId: string) =>
  tx.$queryRaw<SharedRow[]>`
    SELECT "id"::text AS "id", "status"::text AS "status"
    FROM "channel"."ChannelCategory"
    WHERE "id" = (
      SELECT "mergedIntoId" FROM "channel"."ChannelCategory" WHERE "id" = ${sourceId}::uuid
    )
    FOR SHARE
  `;

const resolveActive = async (
  tx: Transaction,
  row: SharedRow | undefined,
): Promise<string | null> => {
  if (row === undefined) {
    return null;
  }
  if (row.status === "active") {
    return row.id;
  }
  return resolveActive(tx, (await shareMergeTarget(tx, row.id))[0]);
};

const eventOf = ({
  userId,
  categoryId,
  pair,
}: {
  userId: string;
  categoryId: string;
  pair: CategoryFollowPair;
}) => {
  if (pair.state === "following") {
    const payload = {
      userId,
      categoryId,
      followedAt: pair.followedAt.toISOString(),
      version: pair.version,
    } satisfies z.input<typeof channelCategoryFollowed.payload>;
    return {
      name: channelCategoryFollowed.name,
      version: channelCategoryFollowed.version,
      payload,
    };
  }
  const payload = {
    userId,
    categoryId,
    reason: pair.endedReason,
    version: pair.version,
  } satisfies z.input<typeof channelCategoryUnfollowed.payload>;
  return {
    name: channelCategoryUnfollowed.name,
    version: channelCategoryUnfollowed.version,
    payload,
  };
};

export const prismaCategoryFollows = (prisma: ChannelPrisma): CategoryFollows => ({
  change: ({ userId, slug, transition, outboxEventId, occurredAt }) =>
    prisma.$transaction(async (tx) => {
      const categoryId = await resolveActive(tx, (await shareBySlug(tx, slug))[0]);
      if (categoryId === null) {
        return err("category_not_found");
      }
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${`${userId}:${categoryId}`}, 0))
      `;
      const where = { userId_categoryId: { userId, categoryId } };
      const next = transition(
        await tx.channelCategoryFollow.findUnique({
          where,
          select: { state: true, version: true },
        }),
      );
      if (next === null) {
        return ok(undefined);
      }
      await tx.channelCategoryFollow.upsert({
        where,
        create: { userId, categoryId, ...next },
        update: next,
      });
      await appendToOutbox(tx, {
        outbox: OUTBOX,
        event: { id: outboxEventId, ...eventOf({ userId, categoryId, pair: next }), occurredAt },
      });
      return ok(undefined);
    }),
});
