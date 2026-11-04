import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { settledWithin, withPausedRedis } from "../../platform/testing/paused-redis.ts";
import { createPresenceRedis, redisPresenceStore } from "./infrastructure/redis-presence-store.ts";

const urlOf = (variable: string): string => {
  const url = process.env[variable];
  if (url === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return url;
};

const REDIS_URL = urlOf("REDIS_URL");

const UNREACHABLE_REDIS_URL = "redis://127.0.0.1:1";

const DEADLINE_WITH_MARGIN_MS = 2500;

const redis = createPresenceRedis(REDIS_URL);

const unreachableRedis = createPresenceRedis(UNREACHABLE_REDIS_URL).on("error", () => {});

beforeAll(async () => {
  await redis.connect();
  unreachableRedis.connect().catch(() => {});
});

afterAll(() => {
  redis.destroy();
  unreachableRedis.destroy();
});

const store = redisPresenceStore(redis);

const WINDOW_MS = 30_000;

const windowStart = (index: number): Date => new Date(Date.UTC(2099, 0, 1) + index * WINDOW_MS);

const after = (at: Date, ms: number): Date => new Date(at.getTime() + ms);

const countAt = async (channelId: string, at: Date): Promise<number | undefined> =>
  (await store.count({ channelIds: [channelId], at })).get(channelId);

describe("présence des viewers dans Redis (ADR 0004 §3)", () => {
  it("compte une fois deux heartbeats du même viewer, et deux viewers distincts", async () => {
    const channelId = randomUUID();
    const viewer = randomUUID();
    const at = windowStart(10);

    await store.record({ channelId, viewerId: viewer, at });
    await store.record({ channelId, viewerId: viewer, at: after(at, 15_000) });
    expect(await countAt(channelId, after(at, 15_000))).toBe(1);

    await store.record({ channelId, viewerId: randomUUID(), at: after(at, 15_000) });
    expect(await countAt(channelId, after(at, 15_000))).toBe(2);
  });

  it("compte zéro viewer pour une chaîne sans heartbeat", async () => {
    expect(await countAt(randomUUID(), windowStart(10))).toBe(0);
  });

  it("garde un viewer jusqu'à 60 s après un heartbeat en début de fenêtre", async () => {
    const channelId = randomUUID();
    const at = windowStart(20);
    await store.record({ channelId, viewerId: randomUUID(), at });

    expect(await countAt(channelId, after(at, 59_999))).toBe(1);
    expect(await countAt(channelId, after(at, 60_000))).toBe(0);
  });

  it("garde un viewer au moins 30 s après un heartbeat en fin de fenêtre", async () => {
    const channelId = randomUUID();
    const at = after(windowStart(30), 29_999);
    await store.record({ channelId, viewerId: randomUUID(), at });

    expect(await countAt(channelId, after(at, 30_000))).toBe(1);
    expect(await countAt(channelId, after(at, 30_001))).toBe(0);
  });

  it("ne compte pas un heartbeat venu après l'instant lu", async () => {
    const channelId = randomUUID();
    await store.record({ channelId, viewerId: randomUUID(), at: windowStart(41) });

    expect(await countAt(channelId, windowStart(40))).toBe(0);
  });

  it("lit les compteurs de plusieurs chaînes à la fois, chacune avec ses viewers", async () => {
    const [first, second, empty] = [randomUUID(), randomUUID(), randomUUID()];
    const at = windowStart(50);
    await store.record({ channelId: first, viewerId: randomUUID(), at });
    await store.record({ channelId: second, viewerId: randomUUID(), at });
    await store.record({ channelId: second, viewerId: randomUUID(), at });

    const counts = await store.count({ channelIds: [first, second, empty], at });

    expect([...counts.entries()]).toEqual([
      [first, 1],
      [second, 2],
      [empty, 0],
    ]);
  });

  it("ne lit aucun compteur pour une liste de chaînes vide", async () => {
    expect(await store.count({ channelIds: [], at: windowStart(60) })).toEqual(new Map());
  });

  it("ne garde une fenêtre que 90 s dans Redis", async () => {
    const channelId = randomUUID();
    await store.record({ channelId, viewerId: randomUUID(), at: new Date() });

    const ttls = await Promise.all(
      (await redis.keys(`stream:presence:${channelId}:*`)).map((key) => redis.ttl(key)),
    );

    expect(ttls).toHaveLength(1);
    expect(ttls[0]).toBeGreaterThan(85);
    expect(ttls[0]).toBeLessThanOrEqual(90);
  });
});

const deadlineExceeded = {
  status: "rejected",
  reason: expect.objectContaining({ message: expect.stringContaining("2000 ms") }),
  inTime: true,
};

const whilePaused = (run: () => Promise<unknown>) =>
  withPausedRedis(REDIS_URL, () => settledWithin(run, DEADLINE_WITH_MARGIN_MS));

const unreachableStore = redisPresenceStore(unreachableRedis);

describe("présence : Redis qui ne répond plus en 2 s", () => {
  it("la lecture des compteurs échoue au lieu d'attendre", async () => {
    expect(
      await whilePaused(() => store.count({ channelIds: [randomUUID()], at: windowStart(70) })),
    ).toEqual(deadlineExceeded);
  });

  it("l'enregistrement d'un heartbeat échoue au lieu d'attendre", async () => {
    expect(
      await whilePaused(() =>
        store.record({ channelId: randomUUID(), viewerId: randomUUID(), at: windowStart(70) }),
      ),
    ).toEqual(deadlineExceeded);
  });

  it("la lecture des compteurs échoue au lieu d'attendre quand Redis est injoignable", async () => {
    expect(
      await settledWithin(
        () => unreachableStore.count({ channelIds: [randomUUID()], at: windowStart(70) }),
        DEADLINE_WITH_MARGIN_MS,
      ),
    ).toEqual(deadlineExceeded);
  });
});
