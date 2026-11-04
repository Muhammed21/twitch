import { events } from "@repo/contracts";

import type { ChannelPrisma } from "./prisma-channel-registry.ts";

type Transaction = Parameters<Parameters<ChannelPrisma["$transaction"]>[0]>[0];

const { channelCategoryFollowed, channelCategoryUnfollowed } = events.channel;

const utc = (date: Date) => date.toISOString();

export const transferFollows = (
  tx: Transaction,
  { sourceId, targetId, occurredAt }: { sourceId: string; targetId: string; occurredAt: Date },
) =>
  tx.$executeRaw`
    WITH "moved" AS (
      INSERT INTO "channel"."ChannelCategoryFollow"
        ("userId", "categoryId", "state", "followedAt", "version", "endedReason")
      SELECT "userId", ${targetId}::uuid, 'following', "followedAt", 1, NULL
      FROM "channel"."ChannelCategoryFollow"
      WHERE "categoryId" = ${sourceId}::uuid AND "state" = 'following'
      ON CONFLICT ("userId", "categoryId") DO UPDATE
        SET "state" = 'following',
            "followedAt" = EXCLUDED."followedAt",
            "version" = "ChannelCategoryFollow"."version" + 1,
            "endedReason" = NULL
        WHERE "ChannelCategoryFollow"."state" = 'not_following'
      RETURNING "userId", "followedAt", "version"
    )
    INSERT INTO "channel"."ChannelOutbox" ("id", "name", "version", "payload", "occurredAt", "nextAttemptAt")
    SELECT
      gen_random_uuid(),
      ${channelCategoryFollowed.name},
      ${channelCategoryFollowed.version},
      jsonb_build_object(
        'userId', "userId",
        'categoryId', ${targetId}::uuid,
        'followedAt', to_char("followedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'version', "version"
      ),
      (${utc(occurredAt)}::timestamptz AT TIME ZONE 'UTC'),
      (${utc(occurredAt)}::timestamptz AT TIME ZONE 'UTC')
    FROM "moved"
  `;

export const closeFollows = (
  tx: Transaction,
  {
    categoryId,
    reason,
    occurredAt,
  }: { categoryId: string; reason: "category_merged" | "category_retired"; occurredAt: Date },
) =>
  tx.$executeRaw`
    WITH "closed" AS (
      UPDATE "channel"."ChannelCategoryFollow"
      SET "state" = 'not_following',
          "followedAt" = NULL,
          "version" = "version" + 1,
          "endedReason" = ${reason}::"channel"."ChannelCategoryFollowEndedReason"
      WHERE "categoryId" = ${categoryId}::uuid AND "state" = 'following'
      RETURNING "userId", "version"
    )
    INSERT INTO "channel"."ChannelOutbox" ("id", "name", "version", "payload", "occurredAt", "nextAttemptAt")
    SELECT
      gen_random_uuid(),
      ${channelCategoryUnfollowed.name},
      ${channelCategoryUnfollowed.version},
      jsonb_build_object(
        'userId', "userId",
        'categoryId', ${categoryId}::uuid,
        'reason', ${reason}::text,
        'version', "version"
      ),
      (${utc(occurredAt)}::timestamptz AT TIME ZONE 'UTC'),
      (${utc(occurredAt)}::timestamptz AT TIME ZONE 'UTC')
    FROM "closed"
  `;
