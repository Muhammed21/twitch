import { setTimeout as sleep } from "node:timers/promises";

import { createClient } from "redis";

import { withRedisDeadline } from "./redis-deadline.ts";
import { parseStreamEntry, type StreamEvent } from "./stream-entry.ts";

const COMMAND_TIMEOUT_MS = 2000;
const BATCH_SIZE = 10;

export const createStreamConsumerRedis = (url?: string) =>
  createClient({
    url,
    name: "api-stream-consumer",
    commandOptions: { timeout: COMMAND_TIMEOUT_MS },
  });

export type StreamConsumerRedis = ReturnType<typeof createStreamConsumerRedis>;

export type StreamHandler = (event: StreamEvent) => Promise<void>;

export type StreamConsumerError = {
  readonly stream: string;
  readonly entryId: string;
  readonly error: unknown;
};

type StreamEntryReply = { readonly id: string; readonly message: Record<string, string> };

type ConsumerOptions = {
  redis: StreamConsumerRedis;
  stream: string;
  group: string;
  consumer: string;
  handlers: Readonly<Record<string, StreamHandler>>;
  claimIdleMs: number;
  blockMs: number;
  onError: (failure: StreamConsumerError) => void;
};

export const ensureGroup = async ({
  redis,
  stream,
  group,
}: {
  redis: StreamConsumerRedis;
  stream: string;
  group: string;
}): Promise<void> => {
  try {
    await withRedisDeadline(redis.xGroupCreate(stream, group, "0", { MKSTREAM: true }));
  } catch (error) {
    if (!(error instanceof Error && error.message.startsWith("BUSYGROUP"))) {
      throw error;
    }
  }
};

const handled = async (
  { handlers, onError, stream }: ConsumerOptions,
  entry: StreamEntryReply,
): Promise<boolean> => {
  const event = parseStreamEntry(entry.message);
  if (event === null) {
    onError({ stream, entryId: entry.id, error: new Error("entrée illisible") });
    return true;
  }
  const handler = handlers[event.name];
  if (handler === undefined) {
    return true;
  }
  try {
    await handler(event);
    return true;
  } catch (error) {
    onError({ stream, entryId: entry.id, error });
    return false;
  }
};

const processEntries = async (
  options: ConsumerOptions,
  entries: readonly StreamEntryReply[],
): Promise<void> => {
  for (const entry of entries) {
    if (await handled(options, entry)) {
      await withRedisDeadline(options.redis.xAck(options.stream, options.group, entry.id));
    }
  }
};

const claimStale = async ({
  redis,
  stream,
  group,
  consumer,
  claimIdleMs,
}: ConsumerOptions): Promise<readonly StreamEntryReply[]> => {
  const { messages } = await withRedisDeadline(
    redis.xAutoClaim(stream, group, consumer, claimIdleMs, "0-0", { COUNT: BATCH_SIZE }),
  );
  return messages.flatMap((message) => (message === null ? [] : [message]));
};

const readNew = async ({
  redis,
  stream,
  group,
  consumer,
  blockMs,
}: ConsumerOptions): Promise<readonly StreamEntryReply[]> => {
  const reply = await withRedisDeadline(
    redis.xReadGroup(
      group,
      consumer,
      { key: stream, id: ">" },
      { COUNT: BATCH_SIZE, BLOCK: blockMs },
    ),
  );
  return (reply ?? []).flatMap((streamReply) => streamReply.messages);
};

export const consumeOnce = async (options: ConsumerOptions): Promise<void> => {
  await processEntries(options, await claimStale(options));
  await processEntries(options, await readNew(options));
};

const isMissingGroup = (error: unknown): boolean =>
  error instanceof Error && error.message.startsWith("NOGROUP");

export const startStreamConsumer = (options: ConsumerOptions): { stop: () => Promise<void> } => {
  const stopping = new AbortController();
  const recover = async (error: unknown): Promise<void> => {
    if (isMissingGroup(error)) {
      await ensureGroup(options).catch(recover);
      return;
    }
    options.onError({ stream: options.stream, entryId: "", error });
    await sleep(options.blockMs, undefined, { signal: stopping.signal }).catch(() => undefined);
  };
  const running = (async () => {
    while (!stopping.signal.aborted) {
      await consumeOnce(options).catch(recover);
    }
  })();
  return {
    stop: async () => {
      stopping.abort();
      await running;
    },
  };
};
