import type { Pool } from "pg";

import { readOutboxHistory } from "@repo/db";

import type { OutboxHistory } from "../application/rebuild-live-channel-views.ts";

const OUTBOXES = [
  { schema: "channel", table: "ChannelOutbox" },
  { schema: "stream", table: "StreamOutbox" },
];

export const pgOutboxHistory = (pool: Pool): OutboxHistory => ({
  page: ({ after, take }) => readOutboxHistory({ pool, outboxes: OUTBOXES, after, take }),
});
