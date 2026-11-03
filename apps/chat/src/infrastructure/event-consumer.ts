import { setTimeout as sleep } from "node:timers/promises";

import { createClient } from "redis";

import { parseStreamEntry, type StreamEvent } from "./stream-entry.ts";

export type EventHandler = (event: StreamEvent) => Promise<void>;

const BATCH_SIZE = 10;

export const createConsumerRedis = (url: string) =>
  createClient({ url, name: "chat-event-consumer", disableOfflineQueue: true });

export type ConsumerRedis = ReturnType<typeof createConsumerRedis>;

export type ConsumerFailure = {
  readonly stream: string;
  readonly entryId: string;
  readonly error: unknown;
};

type Entry = { readonly id: string; readonly message: Record<string, string> };

type ConsumerOptions = {
  redis: ConsumerRedis;
  streams: readonly string[];
  group: string;
  consumer: string;
  handlers: Readonly<Record<string, EventHandler>>;
  claimIdleMs: number;
  blockMs: number;
  onError: (failure: ConsumerFailure) => void;
};

const isBusyGroup = (error: unknown): boolean =>
  error instanceof Error && error.message.startsWith("BUSYGROUP");

const ensureGroups = async ({ redis, streams, group }: ConsumerOptions): Promise<void> => {
  await Promise.all(
    streams.map((stream) =>
      redis.xGroupCreate(stream, group, "0", { MKSTREAM: true }).catch((error: unknown) => {
        if (!isBusyGroup(error)) {
          throw error;
        }
      }),
    ),
  );
};

const handled = async (
  { handlers, onError }: ConsumerOptions,
  stream: string,
  entry: Entry,
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
  stream: string,
  entries: readonly Entry[],
): Promise<void> => {
  for (const entry of entries) {
    if (await handled(options, stream, entry)) {
      await options.redis.xAck(stream, options.group, entry.id);
    }
  }
};

const claimStale = async (options: ConsumerOptions, stream: string): Promise<void> => {
  const { redis, group, consumer, claimIdleMs } = options;
  const { messages } = await redis.xAutoClaim(stream, group, consumer, claimIdleMs, "0-0", {
    COUNT: BATCH_SIZE,
  });
  await processEntries(
    options,
    stream,
    messages.flatMap((message) => (message === null ? [] : [message])),
  );
};

const readNew = async (options: ConsumerOptions): Promise<void> => {
  const { redis, streams, group, consumer, blockMs } = options;
  const reply = await redis.xReadGroup(
    group,
    consumer,
    streams.map((key) => ({ key, id: ">" })),
    { COUNT: BATCH_SIZE, BLOCK: blockMs },
  );
  for (const { name, messages } of reply ?? []) {
    await processEntries(options, name, messages);
  }
};

const consumeOnce = async (options: ConsumerOptions): Promise<void> => {
  for (const stream of options.streams) {
    await claimStale(options, stream);
  }
  await readNew(options);
};

const isMissingGroup = (error: unknown): boolean =>
  error instanceof Error && error.message.startsWith("NOGROUP");

export const startEventConsumer = (options: ConsumerOptions): { stop: () => Promise<void> } => {
  const stopping = new AbortController();
  const pause = () =>
    sleep(options.blockMs, undefined, { signal: stopping.signal }).catch(() => undefined);
  const report = async (error: unknown): Promise<void> => {
    if (options.redis.isReady) {
      options.onError({ stream: options.streams.join(","), entryId: "", error });
    }
    await pause();
  };
  const prepare = async (): Promise<void> => {
    try {
      await ensureGroups(options);
    } catch (failure) {
      await report(failure);
    }
  };
  const recover = async (error: unknown): Promise<void> => {
    if (isMissingGroup(error)) {
      await prepare();
      return;
    }
    await report(error);
  };
  const running = (async () => {
    await prepare();
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
