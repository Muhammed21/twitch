import { describe, expect, it } from "vitest";

import { memoryWindowCounter } from "../testing/memory-window-counter.ts";
import { imageUploadRateLimit } from "./image-upload-rate-limit.ts";

const USER_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const OTHER_USER_ID = "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e";
const WINDOW_START = new Date("2026-11-04T12:00:00.000Z");

const prepareTimes = (limit: (userId: string) => Promise<unknown>, times: number) =>
  Promise.all(Array.from({ length: times }, () => limit(USER_ID)));

describe("limite des préparations d'envoi d'image", () => {
  it("accepte 20 préparations par utilisateur en 10 minutes", async () => {
    const limit = imageUploadRateLimit({
      counter: memoryWindowCounter().counter,
      now: () => WINDOW_START,
    });
    await prepareTimes(limit, 19);

    expect(await limit(USER_ID)).toEqual({ allowed: true });
  });

  it("refuse la 21e préparation jusqu'à la fin de la fenêtre", async () => {
    const limit = imageUploadRateLimit({
      counter: memoryWindowCounter().counter,
      now: () => WINDOW_START,
    });
    await prepareTimes(limit, 20);

    expect(await limit(USER_ID)).toEqual({ allowed: false, retryAfterSeconds: 600 });
  });

  it("compte chaque utilisateur à part", async () => {
    const limit = imageUploadRateLimit({
      counter: memoryWindowCounter().counter,
      now: () => WINDOW_START,
    });
    await prepareTimes(limit, 20);

    expect(await limit(OTHER_USER_ID)).toEqual({ allowed: true });
  });

  it("range les compteurs sous le nom images:upload", async () => {
    const { counter, calls } = memoryWindowCounter();

    await imageUploadRateLimit({ counter, now: () => WINDOW_START })(USER_ID);

    expect(calls).toEqual([
      {
        key: `ratelimit:images:upload:${USER_ID}:${WINDOW_START.getTime() / 600_000}`,
        ttlMs: 600_000,
      },
    ]);
  });
});
