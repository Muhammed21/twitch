import type { Pool } from "pg";
import { z } from "zod";

import type { HistoryEvent, OutboxHistory } from "../application/rebuild-live-channel-views.ts";

const HistoryRow = z.object({
  id: z.string(),
  name: z.string(),
  version: z.number(),
  payload: z.unknown(),
  occurredAt: z.date(),
});

const COLUMNS = `"id"::text AS "id", "name", "version", "payload", "occurredAt"`;

export const pgOutboxHistory = (pool: Pool): OutboxHistory => ({
  page: async ({ after, take }: { after: HistoryEvent | undefined; take: number }) => {
    const { rows } = await pool.query<Record<string, unknown>>(
      `SELECT * FROM (
         SELECT ${COLUMNS} FROM "channel"."ChannelOutbox"
         UNION ALL
         SELECT ${COLUMNS} FROM "stream"."StreamOutbox"
       ) AS history
       WHERE $1::timestamp IS NULL OR ("occurredAt", "id") > ($1::timestamp, $2::text)
       ORDER BY "occurredAt", "id"
       LIMIT $3`,
      [after?.occurredAt ?? null, after?.id ?? null, take],
    );
    return rows.map((row) => HistoryRow.parse(row));
  },
});
