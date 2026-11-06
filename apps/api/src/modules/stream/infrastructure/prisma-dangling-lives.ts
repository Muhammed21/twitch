import { z } from "zod";

import { events } from "@repo/contracts";
import { appendToOutbox } from "@repo/db";

import type { DanglingLives } from "../application/end-dangling-lives.ts";
import type { StreamPrisma } from "./prisma-stream-sessions.ts";

const OUTBOX = { schema: "stream", table: "StreamOutbox" };

const { streamStarted, streamEnded } = events.stream;

const DanglingRow = z.object({
  sessionId: z.string(),
  channelId: z.string(),
  startedAt: z.date(),
});

export const prismaDanglingLives = (prisma: StreamPrisma): DanglingLives => ({
  list: async () => {
    const rows: unknown = await prisma.$queryRaw`
      SELECT DISTINCT ON ("sessionId") "sessionId", "channelId", "startedAt"
        FROM (
          SELECT "id"::text AS "sessionId", "channelId"::text AS "channelId",
                 "startedAt" AT TIME ZONE 'UTC' AS "startedAt"
            FROM "stream"."StreamSession"
           WHERE "endedAt" IS NULL
          UNION ALL
          SELECT o."payload"->>'sessionId', o."payload"->>'channelId',
                 (o."payload"->>'startedAt')::timestamptz
            FROM "stream"."StreamOutbox" o
           WHERE o."name" = ${streamStarted.name}
             AND o."payload"->>'sessionId' IS NOT NULL
             AND o."payload"->>'channelId' IS NOT NULL
             AND o."payload"->>'startedAt' IS NOT NULL
             AND NOT EXISTS (
               SELECT 1 FROM "stream"."StreamOutbox" e
                WHERE e."name" = ${streamEnded.name}
                  AND e."payload"->>'sessionId' = o."payload"->>'sessionId'
                  AND e."payload"->>'channelId' = o."payload"->>'channelId'
             )
        ) AS "dangling"
       ORDER BY "sessionId"
    `;
    return z.array(DanglingRow).parse(rows);
  },
  end: ({ live: { sessionId, channelId }, endedAt, outboxEventId }) =>
    prisma.$transaction(async (tx) => {
      await tx.streamSession.updateMany({
        where: { id: sessionId, endedAt: null },
        data: { endedAt },
      });
      const payload = {
        sessionId,
        channelId,
        endedAt: endedAt.toISOString(),
      } satisfies z.input<typeof streamEnded.payload>;
      await appendToOutbox(tx, {
        outbox: OUTBOX,
        event: {
          id: outboxEventId,
          name: streamEnded.name,
          version: streamEnded.version,
          payload,
          occurredAt: endedAt,
        },
      });
    }),
});
