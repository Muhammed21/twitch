import { createClient } from "redis";

const PAUSE_MS = 3500;

export const withPausedRedis = async <T>(url: string, run: () => Promise<T>): Promise<T> => {
  const admin = await createClient({ url }).connect();
  try {
    await admin.sendCommand(["CLIENT", "PAUSE", String(PAUSE_MS), "ALL"]);
    return await run();
  } finally {
    await admin.sendCommand(["CLIENT", "UNPAUSE"]);
    admin.destroy();
  }
};

export const settledWithin = async (run: () => Promise<unknown>, ms: number) => {
  const startedAt = performance.now();
  const outcome = await run().then(
    (value) => ({ status: "fulfilled" as const, value }),
    (reason: unknown) => ({ status: "rejected" as const, reason }),
  );
  return { ...outcome, inTime: performance.now() - startedAt < ms };
};
