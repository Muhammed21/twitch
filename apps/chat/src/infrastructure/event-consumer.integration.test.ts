import { randomUUID } from "node:crypto";

import { describe, expect, it, onTestFinished, vi } from "vitest";

import { type ConsumerFailure, createConsumerRedis, startEventConsumer } from "./event-consumer.ts";
import type { StreamEvent } from "./stream-entry.ts";

const REDIS_URL = process.env["REDIS_URL"] ?? "redis://127.0.0.1:6379";
const GROUP = "chat";

const connect = async () => {
  const redis = createConsumerRedis(REDIS_URL);
  await redis.connect();
  onTestFinished(() => {
    if (redis.isOpen) {
      redis.destroy();
    }
  });
  return redis;
};

const OCCURRED_AT = new Date("2026-11-03T20:00:00.000Z");

const makeEntry = (name: string, payload: unknown) => ({
  id: randomUUID(),
  name,
  version: "1",
  occurredAt: OCCURRED_AT.toISOString(),
  payload: JSON.stringify(payload),
});

const setup = async (handler: (event: StreamEvent) => Promise<void>) => {
  const publisher = await connect();
  const consumerRedis = await connect();
  const stream = `test-chat-${randomUUID()}:events.channel`;
  onTestFinished(async () => {
    await publisher.del(stream);
  });
  const failures: ConsumerFailure[] = [];
  const consumer = startEventConsumer({
    redis: consumerRedis,
    streams: [stream],
    group: GROUP,
    consumer: "test",
    handlers: { "channel.created": handler },
    claimIdleMs: 50,
    blockMs: 50,
    onError: (failure) => {
      failures.push(failure);
    },
  });
  onTestFinished(() => consumer.stop());
  const pendingCount = async () => (await publisher.xPending(stream, GROUP)).pending;
  return { publisher, consumerRedis, stream, failures, pendingCount };
};

describe("consommateur d'events du chat, contre le Redis de Compose", () => {
  it("livre un event publié à son handler, une fois, puis l'acquitte", async () => {
    const handler = vi.fn<(event: StreamEvent) => Promise<void>>(async () => {});
    const { publisher, stream, pendingCount } = await setup(handler);
    const payload = { channelId: randomUUID() };

    await publisher.xAdd(stream, "*", makeEntry("channel.created", payload));

    await vi.waitFor(() =>
      expect(handler).toHaveBeenCalledWith({
        name: "channel.created",
        version: 1,
        occurredAt: OCCURRED_AT,
        payload,
      }),
    );
    await vi.waitFor(async () => expect(await pendingCount()).toBe(0));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("reprend un event resté en attente après l'échec de son handler", async () => {
    const attempts = { count: 0 };
    const handler = vi.fn<(event: StreamEvent) => Promise<void>>(async () => {
      attempts.count += 1;
      if (attempts.count === 1) {
        throw new Error("Redis injoignable");
      }
    });
    const { publisher, stream, failures, pendingCount } = await setup(handler);

    await publisher.xAdd(stream, "*", makeEntry("channel.created", {}));

    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(2));
    await vi.waitFor(async () => expect(await pendingCount()).toBe(0));
    expect(failures).toEqual([
      expect.objectContaining({ stream, error: new Error("Redis injoignable") }),
    ]);
  });

  it("acquitte sans handler un event que le chat ne traite pas, et signale une entrée illisible", async () => {
    const handler = vi.fn<(event: StreamEvent) => Promise<void>>(async () => {});
    const { publisher, stream, failures, pendingCount } = await setup(handler);

    await publisher.xAdd(stream, "*", makeEntry("channel.metadata_updated", {}));
    await publisher.xAdd(stream, "*", { name: "channel.created" });

    await vi.waitFor(() =>
      expect(failures).toEqual([
        expect.objectContaining({ stream, error: new Error("entrée illisible") }),
      ]),
    );
    await vi.waitFor(async () => expect(await pendingCount()).toBe(0));
    expect(handler).not.toHaveBeenCalled();
  });

  it("recrée son groupe supprimé pendant qu'il tourne, puis reprend la lecture", async () => {
    const handler = vi.fn<(event: StreamEvent) => Promise<void>>(async () => {});
    const { publisher, stream } = await setup(handler);
    await vi.waitFor(async () => expect(await publisher.xInfoGroups(stream)).toHaveLength(1));

    await publisher.xGroupDestroy(stream, GROUP);
    await vi.waitFor(async () => expect(await publisher.xInfoGroups(stream)).toHaveLength(1));
    await publisher.xAdd(stream, "*", makeEntry("channel.created", {}));

    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
  });

  it("se tait tant que sa connexion est coupée", async () => {
    const handler = vi.fn<(event: StreamEvent) => Promise<void>>(async () => {});
    const { consumerRedis, failures } = await setup(handler);

    consumerRedis.destroy();
    await new Promise((resolve) => {
      setTimeout(resolve, 300);
    });

    expect(failures).toEqual([]);
  });
});
