import { isBucketFull, takeToken, type TokenBucket } from "../domain/decide.ts";
import type { RateLimit } from "./ports.ts";

export type LocalTokenBuckets = ReturnType<typeof createLocalTokenBuckets>;

export const createLocalTokenBuckets = () => {
  const buckets = new Map<string, TokenBucket>();

  const take: RateLimit["take"] = async ({ userId, now }) => {
    const taken = takeToken({ bucket: buckets.get(userId), now });
    if (taken === undefined) {
      return false;
    }
    buckets.set(userId, taken);
    return true;
  };

  return {
    take,
    sweep: (now: Date): void => {
      [...buckets]
        .filter(([, bucket]) => isBucketFull({ bucket, now }))
        .forEach(([userId]) => buckets.delete(userId));
    },
    bucketCount: (): number => buckets.size,
  };
};
