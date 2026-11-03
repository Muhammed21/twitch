import type { Pool } from "pg";

import { relayOutboxBatch } from "@repo/db";

import { VIDEO_OUTBOX } from "../persistence/prisma-video-store.ts";
import { webhookPublisher } from "../webhooks/webhook-publisher.ts";
import { jitteredBackoff } from "./relay-loop.ts";

export const relayVideoOutbox =
  ({
    pool,
    webhook,
    now,
    random,
  }: {
    pool: Pool;
    webhook: { readonly url: string; readonly secret: string };
    now: () => Date;
    random: () => number;
  }) =>
  () =>
    relayOutboxBatch({
      pool,
      outbox: VIDEO_OUTBOX,
      publish: webhookPublisher({ ...webhook, now }),
      backoff: jitteredBackoff(random),
      now,
    });
