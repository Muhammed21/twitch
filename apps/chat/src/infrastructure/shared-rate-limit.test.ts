import { afterEach, describe, expect, it, vi } from "vitest";

import type { RateLimit, TokenRequest } from "../application/ports.ts";
import { sharedRateLimit } from "./shared-rate-limit.ts";

const REQUEST: TokenRequest = { userId: "user-1", now: new Date("2026-11-03T20:00:00.000Z") };

afterEach(() => {
  vi.useRealTimers();
});

const answering = (admits: boolean): RateLimit => ({ take: async () => admits });

const makeLocal = (admits: boolean) => {
  const requests: TokenRequest[] = [];
  const local: RateLimit = {
    take: async (request) => {
      requests.push(request);
      return admits;
    },
  };
  return { local, requests };
};

const makeLimit = ({ shared, local }: { shared: RateLimit; local: RateLimit }) => {
  const fallbacks: unknown[] = [];
  const limit = sharedRateLimit({
    shared,
    local,
    onFallback: (error) => fallbacks.push(error),
  });
  return { limit, fallbacks };
};

describe("rate limit partagé entre instances, repli sur le seau local", () => {
  it("suit le seau partagé quand il admet, sans toucher au seau local", async () => {
    const { local, requests } = makeLocal(false);
    const { limit, fallbacks } = makeLimit({ shared: answering(true), local });

    expect(await limit.take(REQUEST)).toBe(true);
    expect(requests).toEqual([]);
    expect(fallbacks).toEqual([]);
  });

  it("suit le seau partagé quand il refuse, même si le seau local admettrait", async () => {
    const { local } = makeLocal(true);

    expect(await makeLimit({ shared: answering(false), local }).limit.take(REQUEST)).toBe(false);
  });

  it("décide par le seau local quand Redis échoue, et signale l'échec", async () => {
    const failure = new Error("connexion refusée");
    const { local, requests } = makeLocal(false);
    const { limit, fallbacks } = makeLimit({
      shared: {
        take: async () => {
          throw failure;
        },
      },
      local,
    });

    expect(await limit.take(REQUEST)).toBe(false);
    expect(requests).toEqual([REQUEST]);
    expect(fallbacks).toEqual([failure]);
  });

  it("décide par le seau local quand Redis ne répond pas en 200 ms, pas avant", async () => {
    vi.useFakeTimers();
    const { local } = makeLocal(true);
    const { limit, fallbacks } = makeLimit({
      shared: { take: () => new Promise<boolean>(() => {}) },
      local,
    });
    const settled = vi.fn<(admitted: boolean) => void>();
    const admitted = limit.take(REQUEST);
    void admitted.then(settled);

    await vi.advanceTimersByTimeAsync(199);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await admitted).toBe(true);
    expect(fallbacks).toEqual([new Error("Redis n'a pas répondu en 200 ms")]);
  });

  it("libère le délai quand Redis répond", async () => {
    vi.useFakeTimers();
    await makeLimit({ shared: answering(true), local: makeLocal(true).local }).limit.take(REQUEST);

    expect(vi.getTimerCount()).toBe(0);
  });
});
