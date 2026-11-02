import { alreadyProcessed, type createContextClient } from "@repo/db";

import type { LiveChannelProjection } from "../application/project-discovery-event.ts";
import type { LiveChannelView } from "../domain/live-channel-view.ts";

export type DiscoveryPrisma = ReturnType<typeof createContextClient>;

const HANDLER = "discovery.live-channel-view";
const PROCESSED_EVENTS = { schema: "discovery", table: "DiscoveryProcessedEvent" };

type ViewRow = {
  readonly channelId: string;
  readonly slug: string | null;
  readonly title: string;
  readonly liveSessionId: string | null;
  readonly liveStartedAt: Date | null;
  readonly lastEndedAt: Date | null;
};

const toView = (row: ViewRow): LiveChannelView => ({
  channelId: row.channelId,
  slug: row.slug,
  title: row.title,
  live:
    row.liveSessionId === null || row.liveStartedAt === null
      ? null
      : { sessionId: row.liveSessionId, startedAt: row.liveStartedAt },
  lastEndedAt: row.lastEndedAt,
});

const toRow = (view: LiveChannelView): ViewRow => ({
  channelId: view.channelId,
  slug: view.slug,
  title: view.title,
  liveSessionId: view.live?.sessionId ?? null,
  liveStartedAt: view.live?.startedAt ?? null,
  lastEndedAt: view.lastEndedAt,
});

export const prismaLiveChannelProjection = (prisma: DiscoveryPrisma): LiveChannelProjection => ({
  update: ({ eventId, channelId, change }) =>
    prisma.$transaction(async (tx) => {
      if (
        await alreadyProcessed(tx, { processedEvents: PROCESSED_EVENTS, eventId, handler: HANDLER })
      ) {
        return;
      }
      await tx.$executeRaw`
        INSERT INTO "discovery"."DiscoveryLiveChannelView" ("channelId")
        VALUES (${channelId}::uuid)
        ON CONFLICT DO NOTHING
      `;
      const rows = await tx.$queryRaw<ViewRow[]>`
        SELECT "channelId"::text AS "channelId", "slug", "title",
               "liveSessionId"::text AS "liveSessionId", "liveStartedAt", "lastEndedAt"
        FROM "discovery"."DiscoveryLiveChannelView"
        WHERE "channelId" = ${channelId}::uuid
        FOR UPDATE
      `;
      const [row] = rows;
      if (row === undefined) {
        throw new Error(`vue de la chaîne ${channelId} introuvable après insertion`);
      }
      await tx.discoveryLiveChannelView.update({
        where: { channelId },
        data: toRow(change(toView(row))),
      });
    }),
});
