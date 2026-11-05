import { describe, expect, it } from "vitest";

import { memoryWindowCounter } from "../../../platform/testing/memory-window-counter.ts";
import { entitlementsSyncRateLimit } from "./entitlements-sync-rate-limit.ts";

const USER_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const NOW = new Date("2026-11-08T09:00:20.000Z");
const WINDOW_MS = 600_000;

describe("limite de débit de la resynchronisation (ADR 0042)", () => {
  it("compte les resynchronisations par compte, dans une fenêtre de 10 minutes qui lui est propre", async () => {
    const window = memoryWindowCounter();

    await entitlementsSyncRateLimit({ counter: window.counter, now: () => NOW })(USER_ID);

    expect(window.calls).toEqual([
      {
        key: `ratelimit:monetization:sync:${USER_ID}:${Math.floor(NOW.getTime() / WINDOW_MS)}`,
        ttlMs: WINDOW_MS,
      },
    ]);
  });
});
