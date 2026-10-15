import { setTimeout as sleep } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import { startPeriodicJob } from "./periodic-job.ts";

const INTERVAL_MS = 5;

const countingJob = (outcome: () => Promise<void> = async () => {}) => {
  const state = { runs: 0, errors: [] as unknown[] };
  const job = startPeriodicJob({
    intervalMs: INTERVAL_MS,
    run: async () => {
      state.runs += 1;
      await outcome();
    },
    onError: (error) => {
      state.errors.push(error);
    },
  });
  return { state, job };
};

describe("tâche périodique", () => {
  it("attend un intervalle avant sa première exécution", async () => {
    const { state, job } = countingJob();

    expect(state.runs).toBe(0);
    await job.stop();
    expect(state.runs).toBe(0);
  });

  it("s'arrête sans attendre la fin de l'intervalle en cours", async () => {
    const job = startPeriodicJob({
      intervalMs: 60_000,
      run: async () => {},
      onError: () => {},
    });
    const stopping = Date.now();

    await job.stop();

    expect(Date.now() - stopping).toBeLessThan(1000);
  });

  it("s'exécute à chaque intervalle tant qu'elle n'est pas arrêtée", async () => {
    const { state, job } = countingJob();

    await sleep(INTERVAL_MS * 20);
    await job.stop();

    expect(state.runs).toBeGreaterThan(1);
  });

  it("ne s'exécute plus une fois arrêtée", async () => {
    const { state, job } = countingJob();
    await sleep(INTERVAL_MS * 4);

    await job.stop();
    const runsAtStop = state.runs;
    await sleep(INTERVAL_MS * 4);

    expect(state.runs).toBe(runsAtStop);
  });

  it("attend la fin de l'exécution en cours avant de rendre l'arrêt", async () => {
    const progress = { finished: false };
    const { state, job } = countingJob(async () => {
      await sleep(INTERVAL_MS * 4);
      progress.finished = true;
    });
    await sleep(INTERVAL_MS * 2);

    await job.stop();

    expect(state.runs).toBe(1);
    expect(progress.finished).toBe(true);
  });

  it("signale l'échec d'une exécution et continue aux intervalles suivants", async () => {
    const failure = new Error("provider injoignable");
    const { state, job } = countingJob(() => Promise.reject(failure));

    await sleep(INTERVAL_MS * 20);
    await job.stop();

    expect(state.runs).toBeGreaterThan(1);
    expect(state.errors).toHaveLength(state.runs);
    expect(state.errors[0]).toBe(failure);
  });
});
