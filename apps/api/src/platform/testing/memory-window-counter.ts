import type { WindowCounter } from "../rate-limit.ts";

export const memoryWindowCounter = () => {
  const counts = new Map<string, number>();
  const calls: { key: string; ttlMs: number }[] = [];
  const counter: WindowCounter = async (key, ttlMs) => {
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    calls.push({ key, ttlMs });
    return count;
  };
  return { counter, calls };
};
