import { randomUUID } from "node:crypto";

import { createClient } from "redis";
import { describe, expect, it, onTestFinished } from "vitest";

import { rateLimitKey, redisTokenBuckets } from "./redis-token-buckets.ts";

const REDIS_URL = process.env["REDIS_URL"] ?? "redis://127.0.0.1:6379";
const NOW = new Date("2026-11-03T20:00:00.000Z");

const secondsFromNow = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

const connectRedis = async () => {
  const redis = createClient({ url: REDIS_URL });
  await redis.connect();
  onTestFinished(() => redis.destroy());
  return redis;
};

const makeUser = async (redis: Awaited<ReturnType<typeof connectRedis>>) => {
  const userId = randomUUID();
  onTestFinished(async () => {
    await redis.del(rateLimitKey(userId));
  });
  return userId;
};

const takeAll = (
  buckets: ReturnType<typeof redisTokenBuckets>,
  { userId, at }: { userId: string; at: readonly Date[] },
): Promise<readonly boolean[]> =>
  at.reduce<Promise<readonly boolean[]>>(
    async (previous, now) => [...(await previous), await buckets.take({ userId, now })],
    Promise.resolve([]),
  );

describe("seau de rate limit dans le Redis de Compose (ADR 0004 §6)", () => {
  it("refuse le sixième message de la rafale", async () => {
    const redis = await connectRedis();
    const userId = await makeUser(redis);

    expect(
      await takeAll(redisTokenBuckets(redis), { userId, at: [NOW, NOW, NOW, NOW, NOW, NOW] }),
    ).toEqual([true, true, true, true, true, false]);
  });

  it("rend un jeton par seconde écoulée, pas avant", async () => {
    const redis = await connectRedis();
    const userId = await makeUser(redis);

    expect(
      (
        await takeAll(redisTokenBuckets(redis), {
          userId,
          at: [
            NOW,
            NOW,
            NOW,
            NOW,
            NOW,
            secondsFromNow(0.999),
            secondsFromNow(1),
            secondsFromNow(1),
          ],
        })
      ).slice(5),
    ).toEqual([false, true, false]);
  });

  it("plafonne la rafale à 5, même après une longue absence", async () => {
    const redis = await connectRedis();
    const userId = await makeUser(redis);
    const buckets = redisTokenBuckets(redis);
    await takeAll(buckets, { userId, at: [NOW, NOW, NOW, NOW, NOW] });
    const later = secondsFromNow(3600);

    expect(
      await takeAll(buckets, { userId, at: [later, later, later, later, later, later] }),
    ).toEqual([true, true, true, true, true, false]);
  });

  it("partage le seau entre deux clients Redis qui le débitent en même temps", async () => {
    const [first, second] = await Promise.all([connectRedis(), connectRedis()]);
    const userId = await makeUser(first);
    const a = redisTokenBuckets(first);
    const b = redisTokenBuckets(second);

    const decisions = await Promise.all(
      [a, b, a, b, a, b, a, b].map((buckets) => buckets.take({ userId, now: NOW })),
    );

    expect(decisions.filter(Boolean)).toHaveLength(5);
  });

  it("débite sans rien retirer un seau entamé, depuis une instance dont l'horloge retarde", async () => {
    const redis = await connectRedis();
    const userId = await makeUser(redis);
    const buckets = redisTokenBuckets(redis);
    await takeAll(buckets, { userId, at: [NOW, NOW, NOW, NOW] });

    expect(await buckets.take({ userId, now: secondsFromNow(-10) })).toBe(true);
  });

  it("ne fait pas reculer le remplissage quand une instance dont l'horloge retarde débite", async () => {
    const redis = await connectRedis();
    const userId = await makeUser(redis);
    const buckets = redisTokenBuckets(redis);
    await takeAll(buckets, { userId, at: [NOW, NOW, NOW, NOW, secondsFromNow(-10)] });

    expect(await buckets.take({ userId, now: secondsFromNow(0.999) })).toBe(false);
  });

  it("expire le seau quand il serait redevenu plein, et ne garde rien d'un refus", async () => {
    const redis = await connectRedis();
    const userId = await makeUser(redis);
    const buckets = redisTokenBuckets(redis);

    await buckets.take({ userId, now: NOW });
    const afterOne = await redis.pTTL(rateLimitKey(userId));
    await takeAll(buckets, { userId, at: [NOW, NOW, NOW, NOW, NOW] });
    const afterBurst = await redis.pTTL(rateLimitKey(userId));

    expect(afterOne).toBeGreaterThan(900);
    expect(afterOne).toBeLessThanOrEqual(1000);
    expect(afterBurst).toBeGreaterThan(4900);
    expect(afterBurst).toBeLessThanOrEqual(5000);
    expect(await redis.hGetAll(rateLimitKey(userId))).toEqual({
      tokens: "0",
      refilledAt: String(NOW.getTime()),
    });
  });
});
