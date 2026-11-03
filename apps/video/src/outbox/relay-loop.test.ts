import { setTimeout as sleep } from "node:timers/promises";

import { describe, expect, it, onTestFinished } from "vitest";

import { jitteredBackoff, startRelayLoop } from "./relay-loop.ts";

const waitUntil = async (condition: () => boolean) => {
  const deadline = Date.now() + 2000;
  while (!condition() && Date.now() < deadline) {
    await sleep(5);
  }
};

describe("backoff du relais", () => {
  it.each([
    [1, 0, 1000],
    [2, 0, 2000],
    [1, 0.5, 750],
    [2, 0.5, 1500],
    [1, 0.999, 500],
    [20, 0, 300_000],
  ])(
    "à la tentative %i et un tirage de %d, attend %i ms : doublé à chaque échec, moins une gigue",
    (attempts, draw, delay) => {
      expect(jitteredBackoff(() => draw)(attempts)).toBe(delay);
    },
  );
});

describe("boucle du relais", () => {
  it("relaie à intervalle régulier, jusqu'à l'arrêt", async () => {
    const runs: number[] = [];
    const loop = startRelayLoop({
      intervalMs: 5,
      relay: async () => {
        runs.push(runs.length);
      },
      onError: () => {},
    });
    onTestFinished(() => loop.stop());

    await waitUntil(() => runs.length >= 3);
    await loop.stop();
    const afterStop = runs.length;
    await sleep(30);

    expect(afterStop).toBeGreaterThanOrEqual(3);
    expect(runs).toHaveLength(afterStop);
  });

  it("signale un lot en échec et continue de relayer", async () => {
    const errors: unknown[] = [];
    const runs: string[] = [];
    const failure = new Error("base injoignable");
    const loop = startRelayLoop({
      intervalMs: 5,
      relay: async () => {
        runs.push("run");
        if (runs.length === 1) {
          throw failure;
        }
      },
      onError: (error) => errors.push(error),
    });
    onTestFinished(() => loop.stop());

    await waitUntil(() => runs.length >= 2);
    await loop.stop();

    expect(errors).toEqual([failure]);
  });

  it("s'arrête sans attendre la fin de l'intervalle", async () => {
    const loop = startRelayLoop({ intervalMs: 60_000, relay: async () => {}, onError: () => {} });
    const startedAt = performance.now();

    await loop.stop();

    expect(performance.now() - startedAt).toBeLessThan(1000);
  });
});
