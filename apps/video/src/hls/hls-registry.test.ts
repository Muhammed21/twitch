import { describe, expect, it } from "vitest";

import { FFMPEG_FRAGMENTED_MP4, makeFragment } from "../segmenter/testing/fmp4-fixtures.ts";
import { createHlsRegistry } from "./hls-registry.ts";

const OPTIONS = { maxBoxSize: 1 << 20, targetSeconds: 2, capacity: 6, maxSegmentBytes: 1 << 20 };

describe("registre des flux HLS", () => {
  it("suit le flux d'une session ouverte, nourri par morceaux, jusqu'à sa fin", () => {
    const registry = createHlsRegistry(OPTIONS);
    registry.open("session-a");

    const half = FFMPEG_FRAGMENTED_MP4.length / 2;
    expect(registry.feed("session-a", FFMPEG_FRAGMENTED_MP4.subarray(0, half))).toEqual({
      ok: true,
      value: undefined,
    });
    registry.feed("session-a", FFMPEG_FRAGMENTED_MP4.subarray(half));
    registry.end("session-a");

    expect(registry.find("session-a")).toMatchObject({ ended: true });
    expect(registry.find("session-a")?.segments).toHaveLength(3);
  });

  it("ignore une session inconnue et ne la crée pas", () => {
    const registry = createHlsRegistry(OPTIONS);

    expect(registry.feed("inconnue", FFMPEG_FRAGMENTED_MP4)).toEqual({
      ok: false,
      error: "unknown_session",
    });
    registry.end("inconnue");

    expect(registry.find("inconnue")).toBeUndefined();
  });

  it("garde le flux d'une session tel qu'il était quand ses octets sont refusés", () => {
    const registry = createHlsRegistry(OPTIONS);
    registry.open("session-a");
    const before = registry.find("session-a");

    const refused = registry.feed(
      "session-a",
      makeFragment({ trackId: 1, decodeTime: 0, samples: [{}] }),
    );

    expect(refused).toEqual({ ok: false, error: "fragment_before_init" });
    expect(registry.find("session-a")).toBe(before);
  });

  it("oublie une session retirée", () => {
    const registry = createHlsRegistry(OPTIONS);
    registry.open("session-a");

    registry.remove("session-a");

    expect(registry.find("session-a")).toBeUndefined();
  });
});
