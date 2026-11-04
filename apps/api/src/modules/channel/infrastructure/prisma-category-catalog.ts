import type { z } from "zod";

import { events } from "@repo/contracts";
import { appendToOutbox } from "@repo/db";

import type { CategoryCatalog } from "../application/category-admin.ts";
import type { ChannelPrisma } from "./prisma-channel-registry.ts";

const OUTBOX = { schema: "channel", table: "ChannelOutbox" };
const VIEW = { id: true, slug: true, name: true, status: true } as const;

const { channelCategoryCreated } = events.channel;

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
});
