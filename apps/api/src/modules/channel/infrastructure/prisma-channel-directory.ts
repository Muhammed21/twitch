import type { z } from "zod";

import { events } from "@repo/contracts";
import { appendToOutbox } from "@repo/db";

import type { ChannelDirectory } from "../application/channel-queries.ts";
import type { ChannelPrisma } from "./prisma-channel-registry.ts";

const OUTBOX = { schema: "channel", table: "ChannelOutbox" };
const VIEW = { id: true, slug: true, title: true, ownerId: true } as const;

const { channelMetadataUpdated } = events.channel;

export const prismaChannelDirectory = (prisma: ChannelPrisma): ChannelDirectory => ({
  findBySlug: (slug) => prisma.channel.findUnique({ where: { slug }, select: VIEW }),
  findById: (id) => prisma.channel.findUnique({ where: { id }, select: VIEW }),
  updateTitle: ({ channelId, title, outboxEventId, occurredAt }) =>
    prisma.$transaction(async (tx) => {
      const updated = await tx.channel.update({
        where: { id: channelId },
        data: { title },
        select: VIEW,
      });
      const payload = { channelId, title } satisfies z.input<typeof channelMetadataUpdated.payload>;
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
      return updated;
    }),
});
