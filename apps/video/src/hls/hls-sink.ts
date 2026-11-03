import type { FragmentSink } from "../media/packager.ts";
import type { HlsFeedRefusal, HlsRegistry } from "./hls-registry.ts";

export const hlsFragmentSink = ({
  registry,
  retentionMs,
  schedule,
  onRefused,
}: {
  readonly registry: HlsRegistry;
  readonly retentionMs: number;
  readonly schedule: (run: () => void, afterMs: number) => void;
  readonly onRefused: (sessionId: string, reason: HlsFeedRefusal) => void;
}): FragmentSink => ({
  onFragmentBytes: (sessionId, chunk) => {
    if (registry.find(sessionId) === undefined) {
      registry.open(sessionId);
    }
    const fed = registry.feed(sessionId, chunk);
    if (!fed.ok && fed.error !== "ended") {
      onRefused(sessionId, fed.error);
      registry.end(sessionId);
    }
  },
  onFragmentsEnd: (sessionId) => {
    registry.end(sessionId);
    schedule(() => registry.remove(sessionId), retentionMs);
  },
});
