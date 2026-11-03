import { randomUUID } from "node:crypto";

import { createClient } from "redis";
import { describe, expect, it, onTestFinished } from "vitest";

import { redisWindowCounter } from "./redis-window-counter.ts";

const REDIS_URL = process.env["REDIS_URL"] ?? "redis://127.0.0.1:6379";

const connect = async () => {
  const redis = createClient({ url: REDIS_URL });
  await redis.connect();
  onTestFinished(() => redis.destroy());
  return redis;
};

const makeKey = () => `test-api-${randomUUID()}:ratelimit`;

describe("compteur de fenêtre dans Redis, contre le Redis de Compose (ADR 0042)", () => {
  it("compte chaque appel sur la même clé", async () => {
    const redis = await connect();
    const count = redisWindowCounter(redis);
    const key = makeKey();
    onTestFinished(async () => {
      await redis.del(key);
    });

    expect(await count(key, 60_000)).toBe(1);
    expect(await count(key, 60_000)).toBe(2);
    expect(await count(makeKey(), 60_000)).toBe(1);
  });

  it("fixe l'expiration au premier appel de la fenêtre, sans la repousser ensuite", async () => {
    const redis = await connect();
    const count = redisWindowCounter(redis);
    const key = makeKey();
    onTestFinished(async () => {
      await redis.del(key);
    });

    await count(key, 60_000);
    await redis.pExpire(key, 5000);
    await count(key, 60_000);

    expect(await redis.pTTL(key)).toBeLessThanOrEqual(5000);
    expect(await redis.pTTL(key)).toBeGreaterThan(0);
  });

  it("expire la clé au bout de la durée donnée", async () => {
    const redis = await connect();
    const count = redisWindowCounter(redis);
    const key = makeKey();
    onTestFinished(async () => {
      await redis.del(key);
    });

    await count(key, 60_000);

    expect(await redis.pTTL(key)).toBeGreaterThan(59_000);
    expect(await redis.pTTL(key)).toBeLessThanOrEqual(60_000);
  });
});
