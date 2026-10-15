import { setTimeout as sleep } from "node:timers/promises";

import type { Pool } from "pg";
import { createClient } from "redis";

import { type OutboxPublisher, relayOutboxBatch, type TableRef } from "@repo/db";

import { withRedisDeadline } from "../platform/redis-deadline.ts";
import { STREAM_MAX_LENGTH, streamOf, toStreamEntry } from "./stream-entry.ts";

const COMMAND_TIMEOUT_MS = 2000;

export const OUTBOXES: readonly TableRef[] = [{ schema: "identity", table: "IdentityOutbox" }];

export const createRelayRedis = (url?: string) =>
  createClient({ url, name: "outbox-relay", commandOptions: { timeout: COMMAND_TIMEOUT_MS } });

export type RelayRedis = ReturnType<typeof createRelayRedis>;

export type RelayError = { readonly outbox: TableRef; readonly error: unknown };

type RelayDependencies = {
  pool: Pool;
  redis: RelayRedis;
  outboxes: readonly TableRef[];
  onError: (failure: RelayError) => void;
};

const streamPublisher =
  (redis: RelayRedis, stream: string): OutboxPublisher =>
  async (event) => {
    await withRedisDeadline(
      redis.xAdd(stream, "*", toStreamEntry(event), {
        TRIM: { strategy: "MAXLEN", strategyModifier: "~", threshold: STREAM_MAX_LENGTH },
      }),
    );
  };

export const relayOutboxes = async ({
  pool,
  redis,
  outboxes,
  onError,
}: RelayDependencies): Promise<void> => {
  for (const outbox of outboxes) {
    await relayOutboxBatch({
      pool,
      outbox,
      publish: streamPublisher(redis, streamOf(outbox)),
    }).catch((error: unknown) => onError({ outbox, error }));
  }
};

export const startOutboxRelay = ({
  intervalMs,
  ...dependencies
}: RelayDependencies & { intervalMs: number }): { stop: () => Promise<void> } => {
  const stopping = new AbortController();
  const running = (async () => {
    while (!stopping.signal.aborted) {
      await relayOutboxes(dependencies);
      await sleep(intervalMs, undefined, { signal: stopping.signal }).catch(() => undefined);
    }
  })();
  return {
    stop: async () => {
      stopping.abort();
      await running;
    },
  };
};
