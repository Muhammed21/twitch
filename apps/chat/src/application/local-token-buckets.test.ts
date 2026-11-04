import { describe, expect, it } from "vitest";

import { createLocalTokenBuckets } from "./local-token-buckets.ts";

const NOW = new Date("2026-11-03T20:00:00.000Z");

const secondsFromNow = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

const takeBurst = (
  buckets: ReturnType<typeof createLocalTokenBuckets>,
  { userId, count, now = NOW }: { userId: string; count: number; now?: Date },
): Promise<readonly boolean[]> =>
  Array.from({ length: count }).reduce<Promise<readonly boolean[]>>(
    async (previous) => [...(await previous), await buckets.take({ userId, now })],
    Promise.resolve([]),
  );

describe("seaux de rate limit en mémoire de l'instance", () => {
  it("retient le seau d'un message à l'autre : le sixième de la rafale est refusé", async () => {
    const buckets = createLocalTokenBuckets();

    expect(await takeBurst(buckets, { userId: "user-1", count: 6 })).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
    ]);
  });

  it("tient un seau par utilisateur", async () => {
    const buckets = createLocalTokenBuckets();
    await takeBurst(buckets, { userId: "user-1", count: 5 });

    expect(await buckets.take({ userId: "user-2", now: NOW })).toBe(true);
  });

  it("oublie les seaux redevenus pleins et garde les seaux entamés", async () => {
    const buckets = createLocalTokenBuckets();
    await takeBurst(buckets, { userId: "user-1", count: 1 });
    await takeBurst(buckets, { userId: "user-2", count: 1, now: secondsFromNow(1) });

    buckets.sweep(secondsFromNow(1.5));

    expect(buckets.bucketCount()).toBe(1);
    expect(await takeBurst(buckets, { userId: "user-1", count: 5 })).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
  });
});
