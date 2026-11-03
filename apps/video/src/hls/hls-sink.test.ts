import { describe, expect, it } from "vitest";

import { FFMPEG_FRAGMENTED_MP4, makeFragment } from "../segmenter/testing/fmp4-fixtures.ts";
import { createHlsRegistry } from "./hls-registry.ts";
import { hlsFragmentSink } from "./hls-sink.ts";

const OPTIONS = {
  maxBoxSize: 1 << 20,
  targetSeconds: 2,
  targetDuration: 4,
  capacity: 6,
  maxSegmentBytes: 1 << 20,
};

const RETENTION_MS = 30_000;

const startSink = () => {
  const registry = createHlsRegistry(OPTIONS);
  const scheduled: Array<{ readonly run: () => void; readonly afterMs: number }> = [];
  const refused: Array<{ readonly sessionId: string; readonly reason: string }> = [];
  const sink = hlsFragmentSink({
    registry,
    retentionMs: RETENTION_MS,
    schedule: (run, afterMs) => scheduled.push({ run, afterMs }),
    onRefused: (sessionId, reason) => refused.push({ sessionId, reason }),
  });
  return { registry, sink, scheduled, refused };
};

describe("sortie de ffmpeg vers le flux HLS de la session", () => {
  it("ouvre le flux de la session à son premier octet et le nourrit dans l'ordre", () => {
    const { registry, sink } = startSink();

    sink.onFragmentBytes("session-a", FFMPEG_FRAGMENTED_MP4.subarray(0, 1000));
    sink.onFragmentBytes("session-a", FFMPEG_FRAGMENTED_MP4.subarray(1000));

    expect(registry.find("session-a")?.segments).toHaveLength(2);
    expect(registry.find("session-b")).toBeUndefined();
  });

  it("termine le flux à la fin de la sortie, puis l'oublie après la rétention", () => {
    const { registry, sink, scheduled } = startSink();
    sink.onFragmentBytes("session-a", FFMPEG_FRAGMENTED_MP4);

    sink.onFragmentsEnd("session-a");

    expect(registry.find("session-a")).toMatchObject({ ended: true });
    expect(registry.find("session-a")?.segments).toHaveLength(3);
    expect(scheduled.map(({ afterMs }) => afterMs)).toEqual([RETENTION_MS]);
    scheduled.forEach(({ run }) => run());
    expect(registry.find("session-a")).toBeUndefined();
  });

  it("signale une sortie refusée une seule fois, termine le flux et ignore la suite", () => {
    const { registry, sink, refused } = startSink();
    const fragment = makeFragment({ trackId: 1, decodeTime: 0, samples: [{}] });

    sink.onFragmentBytes("session-a", fragment);
    sink.onFragmentBytes("session-a", FFMPEG_FRAGMENTED_MP4);

    expect(refused).toEqual([{ sessionId: "session-a", reason: "fragment_before_init" }]);
    expect(registry.find("session-a")).toMatchObject({ ended: true, init: undefined });
  });
});
