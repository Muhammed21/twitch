import { describe, expect, it, onTestFinished, vi } from "vitest";

import { FFMPEG_FRAGMENTED_MP4, makeFragment } from "../segmenter/testing/fmp4-fixtures.ts";
import { createHlsRegistry } from "./hls-registry.ts";

const OPTIONS = {
  maxBoxSize: 1 << 20,
  targetSeconds: 2,
  targetDuration: 4,
  partTarget: 0.334,
  capacity: 6,
  maxSegmentBytes: 1 << 20,
};

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

  it("refuse les octets d'une session terminée sans toucher à son flux", () => {
    const registry = createHlsRegistry(OPTIONS);
    registry.open("session-a");
    registry.end("session-a");
    const ended = registry.find("session-a");

    expect(registry.feed("session-a", FFMPEG_FRAGMENTED_MP4)).toEqual({
      ok: false,
      error: "ended",
    });
    expect(registry.find("session-a")).toBe(ended);
  });

  it("oublie une session retirée", () => {
    const registry = createHlsRegistry(OPTIONS);
    registry.open("session-a");

    registry.remove("session-a");

    expect(registry.find("session-a")).toBeUndefined();
  });
});

const hasSegments = (count: number) => (stream: { readonly segments: readonly unknown[] }) =>
  stream.segments.length >= count;

describe("attente d'un flux", () => {
  const LONG_WAIT_MS = 5000;

  it("rend aussitôt le flux qui remplit déjà la condition", async () => {
    const registry = createHlsRegistry(OPTIONS);
    registry.open("session-a");
    registry.feed("session-a", FFMPEG_FRAGMENTED_MP4);

    expect(
      (await registry.waitFor("session-a", hasSegments(2), LONG_WAIT_MS))?.segments,
    ).toHaveLength(2);
  });

  it("rend le flux dès qu'un morceau remplit la condition", async () => {
    const registry = createHlsRegistry(OPTIONS);
    registry.open("session-a");
    const waiting = registry.waitFor("session-a", hasSegments(2), LONG_WAIT_MS);

    registry.feed("session-a", FFMPEG_FRAGMENTED_MP4);

    expect((await waiting)?.segments).toHaveLength(2);
  });

  it("rend le flux à la fin du live, même sans la condition", async () => {
    const registry = createHlsRegistry(OPTIONS);
    registry.open("session-a");
    const waiting = registry.waitFor("session-a", hasSegments(9), LONG_WAIT_MS);

    registry.end("session-a");

    expect(await waiting).toMatchObject({ ended: true });
  });

  it("attend encore après un morceau qui ne remplit pas la condition", async () => {
    const registry = createHlsRegistry(OPTIONS);
    registry.open("session-a");
    const waiting = registry.waitFor("session-a", hasSegments(2), LONG_WAIT_MS);

    registry.feed("session-a", FFMPEG_FRAGMENTED_MP4.subarray(0, 1269));
    expect(registry.waiting()).toBe(1);
    registry.feed("session-a", FFMPEG_FRAGMENTED_MP4.subarray(1269));

    expect((await waiting)?.segments).toHaveLength(2);
  });

  it("ne réévalue pas l'attente d'une session quand une autre change", () => {
    const registry = createHlsRegistry(OPTIONS);
    registry.open("session-a");
    registry.open("session-b");
    const checked: string[] = [];
    void registry.waitFor(
      "session-a",
      (stream) => {
        checked.push(String(stream.segments.length));
        return false;
      },
      LONG_WAIT_MS,
    );

    registry.feed("session-b", FFMPEG_FRAGMENTED_MP4);
    registry.end("session-b");
    registry.remove("session-b");

    expect(checked).toEqual(["0"]);
    registry.remove("session-a");
  });

  it("ne rend rien pour une session inconnue ou retirée pendant l'attente", async () => {
    const registry = createHlsRegistry(OPTIONS);
    registry.open("session-a");
    const waiting = registry.waitFor("session-a", hasSegments(9), LONG_WAIT_MS);

    registry.remove("session-a");

    expect(await waiting).toBeUndefined();
    expect(await registry.waitFor("inconnue", hasSegments(0), LONG_WAIT_MS)).toBeUndefined();
  });

  it("ne rend rien au-delà du délai, puis n'écoute plus le flux", async () => {
    const registry = createHlsRegistry(OPTIONS);
    registry.open("session-a");
    const started = performance.now();

    expect(await registry.waitFor("session-a", hasSegments(9), 50)).toBeUndefined();
    expect(performance.now() - started).toBeGreaterThanOrEqual(45);
    expect(registry.waiting()).toBe(0);
  });

  it("n'écoute plus le flux une fois la condition remplie", async () => {
    const registry = createHlsRegistry(OPTIONS);
    registry.open("session-a");
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const waiting = registry.waitFor("session-a", hasSegments(1), LONG_WAIT_MS);
    registry.feed("session-a", FFMPEG_FRAGMENTED_MP4);
    await waiting;

    expect(registry.waiting()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
