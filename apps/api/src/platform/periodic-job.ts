import { setTimeout as sleep } from "node:timers/promises";

export const startPeriodicJob = ({
  intervalMs,
  run,
  onError,
}: {
  intervalMs: number;
  run: () => Promise<void>;
  onError: (error: unknown) => void;
}): { stop: () => Promise<void> } => {
  const stopping = new AbortController();
  const running = (async () => {
    while (!stopping.signal.aborted) {
      await sleep(intervalMs, undefined, { signal: stopping.signal }).catch(() => undefined);
      if (!stopping.signal.aborted) {
        await run().catch(onError);
      }
    }
  })();
  return {
    stop: async () => {
      stopping.abort();
      await running;
    },
  };
};
