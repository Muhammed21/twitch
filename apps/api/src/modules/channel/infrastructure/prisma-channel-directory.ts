import type { z } from "zod";

import { events } from "@repo/contracts";
import { appendToOutbox } from "@repo/db";
import { err, ok } from "@repo/result";

import type { ChannelDirectory } from "../application/channel-queries.ts";
import type { ChannelPrisma } from "./prisma-channel-registry.ts";

const OUTBOX = { schema: "channel", table: "ChannelOutbox" };
const VIEW = {
  id: true,
  slug: true,
  title: true,
  ownerId: true,
  category: { select: { id: true, slug: true, name: true } },
} as const;

const { channelMetadataUpdated } = events.channel;

type Transaction = Parameters<Parameters<ChannelPrisma["$transaction"]>[0]>[0];

const isActiveCategory = async (tx: Transaction, categoryId: string): Promise<boolean> => {
  const rows = await tx.$queryRaw<{ status: string }[]>`
    SELECT "status"::text AS "status"
    FROM "channel"."ChannelCategory"
    WHERE "id" = ${categoryId}::uuid
    FOR SHARE
  `;
  return rows.some(({ status }) => status === "active");
};

export const prismaChannelDirectory = (prisma: ChannelPrisma): ChannelDirectory => ({
  findBySlug: (slug) => prisma.channel.findUnique({ where: { slug }, select: VIEW }),
  findById: (id) => prisma.channel.findUnique({ where: { id }, select: VIEW }),
  updateMetadata: ({ channelId, title, categoryId, outboxEventId, occurredAt }) =>
    prisma.$transaction(async (tx) => {
      if (typeof categoryId === "string" && !(await isActiveCategory(tx, categoryId))) {
        return err("category_unavailable");
      }
      const updated = await tx.channel.update({
        where: { id: channelId },
        data: { title, categoryId },
        select: VIEW,
      });
      const payload = {
        channelId,
        title: updated.title,
        categoryId: updated.category?.id ?? null,
      } satisfies z.input<typeof channelMetadataUpdated.payload>;
      await appendToOutbox(tx, {
        outbox: OUTBOX,
        event: {
          id: outboxEventId,
          name: channelMetadataUpdated.name,
          version: channelMetadataUpdated.version,
          payload,
          occurredAt,
        },
      });
      return ok(updated);
    }),
});
