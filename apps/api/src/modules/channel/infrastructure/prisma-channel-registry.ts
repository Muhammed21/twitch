import type { z } from "zod";

import { events } from "@repo/contracts";
import { alreadyProcessed, appendToOutbox, type createContextClient } from "@repo/db";

import type { ChannelRegistry } from "../application/create-channel-for-account.ts";
import { firstFreeSlug } from "../domain/channel-slug.ts";

export type ChannelPrisma = ReturnType<typeof createContextClient>;

const HANDLER = "channel.create-on-registration";
const GRANTOR = "svc:channel-registration";
const OUTBOX = { schema: "channel", table: "ChannelOutbox" };
const PROCESSED_EVENTS = { schema: "channel", table: "ChannelProcessedEvent" };

const { channelCreated } = events.channel;

export const prismaChannelRegistry = (prisma: ChannelPrisma): ChannelRegistry => ({
  createForAccount: (request) =>
    prisma.$transaction(async (tx) => {
      if (
        await alreadyProcessed(tx, {
          processedEvents: PROCESSED_EVENTS,
          eventId: request.eventId,
          handler: HANDLER,
        })
      ) {
        return { status: "already-processed" };
      }
      if ((await tx.channel.count({ where: { ownerId: request.ownerId } })) > 0) {
        return { status: "already-processed" };
      }
      const taken = await tx.channel.findMany({
        where: { slug: { in: [...request.candidates] } },
        select: { slug: true },
      });
      const slug = firstFreeSlug({
        candidates: request.candidates,
        taken: new Set(taken.map((channel) => channel.slug)),
      });
      if (slug === null) {
        throw new Error(`aucun slug libre pour le compte ${request.ownerId}`);
      }
      await tx.channel.create({ data: { id: request.channelId, ownerId: request.ownerId, slug } });
      await tx.authzRoleAssignment.create({
        data: {
          subjectId: request.ownerId,
          role: "owner",
          scopeType: "channel",
          scopeId: request.channelId,
          grantedBy: GRANTOR,
        },
      });
      const payload = {
        channelId: request.channelId,
        ownerId: request.ownerId,
        slug,
      } satisfies z.input<typeof channelCreated.payload>;
      await appendToOutbox(tx, {
        outbox: OUTBOX,
        event: {
          id: request.outboxEventId,
          name: channelCreated.name,
          version: channelCreated.version,
          payload,
          occurredAt: request.occurredAt,
        },
      });
      return { status: "created", slug };
    }),
});
