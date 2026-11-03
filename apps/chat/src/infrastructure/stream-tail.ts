import { setTimeout as sleep } from "node:timers/promises";

import type { ConsumerRedis, EventHandler } from "./event-consumer.ts";
import { parseStreamEntry } from "./stream-entry.ts";

const BATCH_SIZE = 10;
const OLDEST_ID = "0-0";

export type TailFailure = { readonly entryId: string; readonly error: unknown };

type TailOptions = {
  redis: ConsumerRedis;
  stream: string;
  handlers: Readonly<Record<string, EventHandler>>;
  blockMs: number;
  onError: (failure: TailFailure) => void;
};

const handle = async (
  { handlers, onError }: TailOptions,
  entry: { readonly id: string; readonly message: Record<string, string> },
): Promise<void> => {
  const event = parseStreamEntry(entry.message);
  if (event === null) {
    onError({ entryId: entry.id, error: new Error("entrée illisible") });
    return;
  }
  await handlers[event.name]?.(event).catch((error: unknown) => {
    onError({ entryId: entry.id, error });
  });
};

export const startStreamTail = (options: TailOptions) => {
  const { redis, stream, blockMs } = options;
  const stopping = new AbortController();
  const position = { lastId: "" };
  const pause = () => sleep(blockMs, undefined, { signal: stopping.signal }).catch(() => undefined);
  const report = async (error: unknown) => {
    if (redis.isReady) {
      options.onError({ entryId: position.lastId, error });
    }
    await pause();
  };
  const start = async () => {
    const [latest] = await redis.xRevRange(stream, "+", "-", { COUNT: 1 });
    position.lastId = latest?.id ?? OLDEST_ID;
  };
  const readOnce = async () => {
    if (position.lastId === "") {
      await start();
      return;
    }
    const reply = await redis.xRead(
      { key: stream, id: position.lastId },
      { COUNT: BATCH_SIZE, BLOCK: blockMs },
    );
    for (const { messages } of reply ?? []) {
      for (const entry of messages) {
        position.lastId = entry.id;
        await handle(options, entry);
      }
    }
  };
  const running = (async () => {
    while (!stopping.signal.aborted) {
      await readOnce().catch(report);
    }
  })();
  return {
    isTailing: () => position.lastId !== "",
    stop: async () => {
      stopping.abort();
      await running;
    },
  };
};
