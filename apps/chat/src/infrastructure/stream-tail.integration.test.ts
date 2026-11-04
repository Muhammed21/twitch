import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import { describe, expect, it, onTestFinished, vi } from "vitest";

import { type ConsumerRedis, createConsumerRedis } from "./event-consumer.ts";
import type { StreamEvent } from "./stream-entry.ts";
import { startStreamTail, type TailFailure } from "./stream-tail.ts";

const REDIS_URL = process.env["REDIS_URL"] ?? "redis://127.0.0.1:6379";

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

const makeEntry = (body: string) => ({
  id: randomUUID(),
  name: "moderation.user.timed_out",
  version: "1",
  occurredAt: new Date().toISOString(),
  payload: JSON.stringify({ body }),
});

const makeStreamName = () => `test-chat-${randomUUID()}:events.moderation`;

const tailOf = ({
  redis,
  stream,
  handler = async () => {},
  blockMs = 50,
}: {
  redis: ConsumerRedis;
  stream: string;
  handler?: (event: StreamEvent) => Promise<void>;
  blockMs?: number;
}) => {
  const failures: TailFailure[] = [];
  const tail = startStreamTail({
    redis,
    stream,
    handlers: { "moderation.user.timed_out": handler },
    blockMs,
    onError: (failure) => {
      failures.push(failure);
    },
  });
  onTestFinished(() => tail.stop());
  return { tail, failures };
};

const setup = async (handler: (event: StreamEvent) => Promise<void>) => {
  const publisher = await connect();
  const stream = makeStreamName();
  onTestFinished(async () => {
    await publisher.del(stream);
  });
  await publisher.xAdd(stream, "*", makeEntry("avant"));
  const { tail, failures } = tailOf({ redis: await connect(), stream, handler });
  await vi.waitFor(() => expect(tail.isTailing()).toBe(true));
  return { publisher, stream, tail, failures };
};

describe("lecture en queue d'un stream par chaque instance, contre le Redis de Compose", () => {
  it("livre les events écrits après son démarrage, dans l'ordre, sans relire les anciens", async () => {
    const bodies: unknown[] = [];
    const { publisher, stream } = await setup(async ({ payload }) => {
      bodies.push(payload);
    });

    await publisher.xAdd(stream, "*", makeEntry("un"));
    await publisher.xAdd(stream, "*", makeEntry("deux"));

    await vi.waitFor(() => expect(bodies).toEqual([{ body: "un" }, { body: "deux" }]));
  });

  it("signale un handler en échec ou une entrée illisible, puis continue", async () => {
    const bodies: unknown[] = [];
    const { publisher, stream, failures } = await setup(async ({ payload }) => {
      if (JSON.stringify(payload).includes("casse")) {
        throw new Error("handler cassé");
      }
      bodies.push(payload);
    });

    await publisher.xAdd(stream, "*", makeEntry("casse"));
    await publisher.xAdd(stream, "*", { name: "" });
    await publisher.xAdd(stream, "*", makeEntry("suite"));

    await vi.waitFor(() => expect(bodies).toEqual([{ body: "suite" }]));
    expect(failures.map(({ error }) => String(error))).toEqual([
      "Error: handler cassé",
      "Error: entrée illisible",
    ]);
  });

  it("ignore un event sans handler", async () => {
    const bodies: unknown[] = [];
    const { publisher, stream, failures } = await setup(async ({ payload }) => {
      bodies.push(payload);
    });

    await publisher.xAdd(stream, "*", { ...makeEntry("autre"), name: "channel.created" });
    await publisher.xAdd(stream, "*", makeEntry("suite"));

    await vi.waitFor(() => expect(bodies).toEqual([{ body: "suite" }]));
    expect(failures).toEqual([]);
  });

  it("attend sans rien signaler tant qu'aucun event n'arrive", async () => {
    const { failures } = await setup(async () => {});

    await sleep(200);

    expect(failures).toEqual([]);
  });

  it("ne livre plus rien une fois arrêtée", async () => {
    const bodies: unknown[] = [];
    const { publisher, stream, tail } = await setup(async ({ payload }) => {
      bodies.push(payload);
    });

    await tail.stop();
    await publisher.xAdd(stream, "*", makeEntry("après"));
    await sleep(200);

    expect(bodies).toEqual([]);
  });

  it("signale une commande refusée par Redis, en espaçant ses tentatives", async () => {
    const publisher = await connect();
    const stream = makeStreamName();
    onTestFinished(async () => {
      await publisher.del(stream);
    });
    await publisher.set(stream, "pas un stream");

    const { failures } = tailOf({ redis: await connect(), stream, blockMs: 100 });
    await sleep(350);

    expect(failures.length).toBeGreaterThanOrEqual(2);
    expect(failures.length).toBeLessThanOrEqual(5);
    expect(failures[0]?.entryId).toBe("");
    expect(String(failures[0]?.error)).toContain("WRONGTYPE");
  });

  it("se tait tant que Redis est injoignable, et s'arrête sans finir sa pause", async () => {
    const { tail, failures } = tailOf({
      redis: createConsumerRedis(REDIS_URL),
      stream: makeStreamName(),
      blockMs: 60_000,
    });
    await sleep(100);
    const stoppingAt = Date.now();

    await tail.stop();

    expect(Date.now() - stoppingAt).toBeLessThan(1000);
    expect(failures).toEqual([]);
    expect(tail.isTailing()).toBe(false);
  });
});
