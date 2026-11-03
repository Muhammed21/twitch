import { setTimeout as sleep } from "node:timers/promises";

import { backoffDelay } from "@repo/db";

const MAX_JITTER_RATIO = 0.5;

export const jitteredBackoff =
  (random: () => number) =>
  (attempts: number): number =>
    Math.round(backoffDelay(attempts) * (1 - MAX_JITTER_RATIO * random()));

export const startRelayLoop = ({
  intervalMs,
  relay,
  onError,
}: {
  intervalMs: number;
  relay: () => Promise<unknown>;
  onError: (error: unknown) => void;
}): { stop: () => Promise<void> } => {
  const stopping = new AbortController();
  const running = (async () => {
    while (!stopping.signal.aborted) {
      await relay().catch(onError);
      await sleep(intervalMs, undefined, { signal: stopping.signal }).catch(() => undefined);
    }
  })();
  return {
    stop: async () => {
      stopping.abort();
      await running;
    },
  };
};
