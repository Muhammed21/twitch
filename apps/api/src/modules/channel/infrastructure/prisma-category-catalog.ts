import type { z } from "zod";

import { events } from "@repo/contracts";
import { appendToOutbox } from "@repo/db";

import type { CategoryCatalog, CategoryStatus } from "../application/category-admin.ts";
import type { ChannelPrisma } from "./prisma-channel-registry.ts";

const OUTBOX = { schema: "channel", table: "ChannelOutbox" };
const VIEW = { id: true, slug: true, name: true, status: true } as const;

const { channelCategoryCreated, channelCategoryMerged, channelCategoryRetired } = events.channel;

type Transaction = Parameters<Parameters<ChannelPrisma["$transaction"]>[0]>[0];

type LockedRow = { readonly id: string; readonly status: CategoryStatus };

const lockCategories = (tx: Transaction, ids: readonly string[]) =>
  tx.$queryRaw<LockedRow[]>`
    SELECT "id"::text AS "id", "status"::text AS "status"
    FROM "channel"."ChannelCategory"
    WHERE "id" = ANY(${[...ids]}::uuid[])
    ORDER BY "id"
    FOR UPDATE
  `;

const isActive = (rows: readonly LockedRow[], id: string): boolean =>
  rows.some((row) => row.id === id && row.status === "active");

export const prismaCategoryCatalog = (prisma: ChannelPrisma): CategoryCatalog => ({
  findBySlug: (slug) => prisma.channelCategory.findUnique({ where: { slug }, select: VIEW }),
  create: ({ categoryId, slug, name, outboxEventId, occurredAt }) =>
    prisma.$transaction(async (tx) => {
      const { count } = await tx.channelCategory.createMany({
        data: [{ id: categoryId, slug, name }],
        skipDuplicates: true,
      });
      if (count === 0) {
        return { ok: false, error: "slug_taken" } as const;
      }
      const payload = { categoryId, slug, name } satisfies z.input<
        typeof channelCategoryCreated.payload
      >;
      await appendToOutbox(tx, {
        outbox: OUTBOX,
        event: {
          id: outboxEventId,
          name: channelCategoryCreated.name,
          version: channelCategoryCreated.version,
          payload,
          occurredAt,
        },
      });
      return { ok: true, value: { id: categoryId, slug, name, status: "active" } } as const;
    }),
  merge: ({ sourceId, targetId, outboxEventId, occurredAt }) =>
    prisma.$transaction(async (tx) => {
      const locked = await lockCategories(tx, [sourceId, targetId]);
      if (!isActive(locked, sourceId) || !isActive(locked, targetId)) {
        return { ok: false, error: "invalid_merge" } as const;
      }
      await tx.channel.updateMany({
        where: { categoryId: sourceId },
        data: { categoryId: targetId },
      });
      await tx.channelCategory.update({
        where: { id: sourceId },
        data: { status: "merged", mergedIntoId: targetId },
      });
      const payload = {
        sourceCategoryId: sourceId,
        targetCategoryId: targetId,
      } satisfies z.input<typeof channelCategoryMerged.payload>;
      await appendToOutbox(tx, {
        outbox: OUTBOX,
        event: {
          id: outboxEventId,
          name: channelCategoryMerged.name,
          version: channelCategoryMerged.version,
          payload,
          occurredAt,
        },
      });
      const target = await tx.channelCategory.findUniqueOrThrow({
        where: { id: targetId },
        select: VIEW,
      });
      return { ok: true, value: target } as const;
    }),
  retire: ({ categoryId, outboxEventId, occurredAt }) =>
    prisma.$transaction(async (tx) => {
      const locked = await lockCategories(tx, [categoryId]);
      if (!isActive(locked, categoryId)) {
        return { ok: false, error: "category_inactive" } as const;
      }
      if ((await tx.channel.count({ where: { categoryId } })) > 0) {
        return { ok: false, error: "category_in_use" } as const;
      }
      const retired = await tx.channelCategory.update({
        where: { id: categoryId },
        data: { status: "retired" },
        select: VIEW,
      });
      const payload = { categoryId } satisfies z.input<typeof channelCategoryRetired.payload>;
      await appendToOutbox(tx, {
        outbox: OUTBOX,
        event: {
          id: outboxEventId,
          name: channelCategoryRetired.name,
          version: channelCategoryRetired.version,
          payload,
          occurredAt,
        },
      });
      return { ok: true, value: retired } as const;
    }),
});
