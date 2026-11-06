import type { z } from "zod";

import { events } from "@repo/contracts";
import { appendToOutbox } from "@repo/db";
import type { Result } from "@repo/result";

import type { AuditActor } from "../../../platform/audit-actor.ts";
import type {
  CategoryCatalog,
  CategoryStatus,
  CategoryView,
} from "../application/category-admin.ts";
import type { CategorySearch } from "../application/category-search.ts";
import type { CategoryName } from "../domain/category.ts";
import { closeFollows, transferFollows } from "./category-follow-transfer.ts";
import type { ChannelPrisma } from "./prisma-channel-registry.ts";

const OUTBOX = { schema: "channel", table: "ChannelOutbox" };
const VIEW = {
  id: true,
  slug: true,
  name: true,
  status: true,
  imageKey: true,
  tags: true,
} as const;

const {
  channelCategoryCreated,
  channelCategoryMerged,
  channelCategoryRetired,
  channelCategoryUpdated,
} = events.channel;

type Transaction = Parameters<Parameters<ChannelPrisma["$transaction"]>[0]>[0];

type LockedRow = {
  readonly id: string;
  readonly status: CategoryStatus;
  readonly imageKey: string | null;
};

const lockCategories = (tx: Transaction, ids: readonly string[]) =>
  tx.$queryRaw<LockedRow[]>`
    SELECT "id"::text AS "id", "status"::text AS "status", "imageKey"
    FROM "channel"."ChannelCategory"
    WHERE "id" = ANY(${[...ids]}::uuid[])
    ORDER BY "id"
    FOR UPDATE
  `;

const isActive = (rows: readonly LockedRow[], id: string): boolean =>
  rows.some((row) => row.id === id && row.status === "active");

const publishUpdated = (
  tx: Transaction,
  {
    category,
    outboxEventId,
    occurredAt,
  }: { category: CategoryView; outboxEventId: string; occurredAt: Date },
) => {
  const payload = {
    categoryId: category.id,
    name: category.name,
    imageKey: category.imageKey,
    tags: [...category.tags],
  } satisfies z.input<typeof channelCategoryUpdated.payload>;
  return appendToOutbox(tx, {
    outbox: OUTBOX,
    event: {
      id: outboxEventId,
      name: channelCategoryUpdated.name,
      version: channelCategoryUpdated.version,
      payload,
      occurredAt,
    },
  });
};

type AuditState = { readonly [key: string]: string | null | readonly string[] };

const audit = (
  tx: Transaction,
  {
    actor,
    action,
    categoryId,
    stateBefore,
    stateAfter,
    occurredAt,
  }: {
    actor: AuditActor;
    action: string;
    categoryId: string;
    stateBefore?: AuditState;
    stateAfter: AuditState;
    occurredAt: Date;
  },
) =>
  tx.auditEntry.create({
    data: {
      occurredAt,
      actorId: actor.actorId,
      onBehalfOf: actor.onBehalfOf,
      source: actor.source,
      action,
      scopeType: "platform",
      scopeId: "platform",
      targetId: categoryId,
      ...(stateBefore === undefined ? {} : { stateBefore }),
      stateAfter,
    },
  });

export const prismaCategoryCatalog = (prisma: ChannelPrisma): CategoryCatalog => ({
  findBySlug: (slug) => prisma.channelCategory.findUnique({ where: { slug }, select: VIEW }),
  create: ({ actor, categoryId, slug, name, outboxEventId, occurredAt }) =>
    prisma.$transaction(async (tx) => {
      const { count } = await tx.channelCategory.createMany({
        data: [{ id: categoryId, slug, name }],
        skipDuplicates: true,
      });
      if (count === 0) {
        return { ok: false, error: "slug_taken" } as const;
      }
      await audit(tx, {
        actor,
        action: channelCategoryCreated.name,
        categoryId,
        stateAfter: { slug, name },
        occurredAt,
      });
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
      return {
        ok: true,
        value: { id: categoryId, slug, name, status: "active", imageKey: null, tags: [] },
      } as const;
    }),
  merge: ({ actor, sourceId, targetId, outboxEventId, occurredAt }) =>
    prisma.$transaction(async (tx) => {
      const locked = await lockCategories(tx, [sourceId, targetId]);
      if (!isActive(locked, sourceId) || !isActive(locked, targetId)) {
        return { ok: false, error: "invalid_merge" } as const;
      }
      await tx.channel.updateMany({
        where: { categoryId: sourceId },
        data: { categoryId: targetId },
      });
      await transferFollows(tx, { sourceId, targetId, occurredAt });
      await closeFollows(tx, { categoryId: sourceId, reason: "category_merged", occurredAt });
      await tx.channelCategory.update({
        where: { id: sourceId },
        data: { status: "merged", mergedIntoId: targetId },
      });
      await audit(tx, {
        actor,
        action: channelCategoryMerged.name,
        categoryId: sourceId,
        stateBefore: { status: "active" },
        stateAfter: { status: "merged", mergedIntoId: targetId },
        occurredAt,
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
  retire: ({ actor, categoryId, outboxEventId, occurredAt }) =>
    prisma.$transaction(async (tx) => {
      const locked = await lockCategories(tx, [categoryId]);
      if (!isActive(locked, categoryId)) {
        return { ok: false, error: "category_inactive" } as const;
      }
      if ((await tx.channel.count({ where: { categoryId } })) > 0) {
        return { ok: false, error: "category_in_use" } as const;
      }
      await closeFollows(tx, { categoryId, reason: "category_retired", occurredAt });
      const retired = await tx.channelCategory.update({
        where: { id: categoryId },
        data: { status: "retired" },
        select: VIEW,
      });
      await audit(tx, {
        actor,
        action: channelCategoryRetired.name,
        categoryId,
        stateBefore: { status: "active" },
        stateAfter: { status: "retired" },
        occurredAt,
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
  changeImage: ({ actor, categoryId, imageKey, outboxEventId, occurredAt }) =>
    prisma.$transaction(async (tx) => {
      const locked = await lockCategories(tx, [categoryId]);
      if (!isActive(locked, categoryId)) {
        return { ok: false, error: "category_inactive" } as const;
      }
      const replacedImageKey = locked.find((row) => row.id === categoryId)?.imageKey ?? null;
      const updated = await tx.channelCategory.update({
        where: { id: categoryId },
        data: { imageKey },
        select: VIEW,
      });
      await audit(tx, {
        actor,
        action: "channel.category.image_changed",
        categoryId,
        stateBefore: { imageKey: replacedImageKey },
        stateAfter: { imageKey },
        occurredAt,
      });
      await publishUpdated(tx, { category: updated, outboxEventId, occurredAt });
      return { ok: true, value: { category: updated, replacedImageKey } } as const;
    }),
  changeTags: ({ actor, categoryId, tags, outboxEventId, occurredAt }) =>
    prisma.$transaction(async (tx) => {
      const locked = await lockCategories(tx, [categoryId]);
      if (!isActive(locked, categoryId)) {
        return { ok: false, error: "category_inactive" } as const;
      }
      const before = await tx.channelCategory.findUniqueOrThrow({
        where: { id: categoryId },
        select: { tags: true },
      });
      const updated = await tx.channelCategory.update({
        where: { id: categoryId },
        data: { tags: [...tags] },
        select: VIEW,
      });
      await audit(tx, {
        actor,
        action: "channel.category.tags_changed",
        categoryId,
        stateBefore: { tags: before.tags },
        stateAfter: { tags: [...tags] },
        occurredAt,
      });
      await publishUpdated(tx, { category: updated, outboxEventId, occurredAt });
      return { ok: true, value: updated } as const;
    }),
});

export const renameCategory =
  (prisma: ChannelPrisma) =>
  ({
    categoryId,
    name,
    outboxEventId,
    occurredAt,
  }: {
    readonly categoryId: string;
    readonly name: CategoryName;
    readonly outboxEventId: string;
    readonly occurredAt: Date;
  }): Promise<Result<CategoryView, "category_inactive">> =>
    prisma.$transaction(async (tx) => {
      const locked = await lockCategories(tx, [categoryId]);
      if (!isActive(locked, categoryId)) {
        return { ok: false, error: "category_inactive" } as const;
      }
      const updated = await tx.channelCategory.update({
        where: { id: categoryId },
        data: { name },
        select: VIEW,
      });
      await publishUpdated(tx, { category: updated, outboxEventId, occurredAt });
      return { ok: true, value: updated } as const;
    });

export const prismaCategorySearch = (prisma: ChannelPrisma): CategorySearch => ({
  search: ({ nameContains, limit }) =>
    prisma.channelCategory.findMany({
      where: {
        status: "active",
        ...(nameContains === undefined
          ? {}
          : { name: { contains: nameContains, mode: "insensitive" } }),
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: limit,
      select: { id: true, slug: true, name: true, imageKey: true },
    }),
});
