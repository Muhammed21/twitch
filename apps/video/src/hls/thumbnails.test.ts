import { describe, expect, it, vi } from "vitest";

import { concatBytes } from "../segmenter/bytes.ts";
import { FFMPEG_FRAGMENTED_MP4 } from "../segmenter/testing/fmp4-fixtures.ts";
import { createHlsRegistry } from "./hls-registry.ts";
import type { HlsStream } from "./hls-stream.ts";
import { createThumbnails, type FrameExtractor } from "./thumbnails.ts";

const OPTIONS = {
  maxBoxSize: 1 << 20,
  targetSeconds: 2,
  targetDuration: 4,
  partTarget: 0.334,
  capacity: 6,
  maxSegmentBytes: 1 << 20,
};
const TTL_MS = 30_000;
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);

const makeStream = (bytes: Uint8Array, { ended = false } = {}): HlsStream => {
  const registry = createHlsRegistry(OPTIONS);
  registry.open("session");
  registry.feed("session", bytes);
  if (ended) {
    registry.end("session");
  }
  const stream = registry.find("session");
  if (stream === undefined) {
    throw new Error("flux absent");
  }
  return stream;
};

const WITH_CLOSED_SEGMENTS = makeStream(FFMPEG_FRAGMENTED_MP4, { ended: true });

const deferred = <T>() => {
  const settle: { resolve: (value: T) => void } = { resolve: () => undefined };
  const promise = new Promise<T>((resolve) => {
    settle.resolve = resolve;
  });
  return { promise, resolve: (value: T) => settle.resolve(value) };
};

const setup = ({ extract = async () => JPEG }: { extract?: FrameExtractor } = {}) => {
  const clock = { now: 1_000_000 };
  const extractor = vi.fn<FrameExtractor>(extract);
  const thumbnails = createThumbnails({ extract: extractor, ttlMs: TTL_MS, now: () => clock.now });
  return { clock, extractor, thumbnails };
};

describe("vignette d'une session en direct", () => {
  it("décode le segment d'init suivi du dernier segment fermé", async () => {
    const { extractor, thumbnails } = setup();

    expect(await thumbnails.of("session", WITH_CLOSED_SEGMENTS)).toEqual({ ok: true, value: JPEG });
    const [init, last] = [
      WITH_CLOSED_SEGMENTS.init?.bytes,
      WITH_CLOSED_SEGMENTS.segments.at(-1)?.bytes,
    ];
    expect(extractor.mock.calls).toEqual([[concatBytes(init ?? JPEG, last ?? JPEG)]]);
    expect(WITH_CLOSED_SEGMENTS.segments.length).toBeGreaterThan(2);
  });

  it("n'extrait rien tant qu'aucun segment n'est fermé", async () => {
    const { extractor, thumbnails } = setup();
    const openOnly = makeStream(FFMPEG_FRAGMENTED_MP4.subarray(0, 4000));

    expect(openOnly.init).toBeDefined();
    expect(await thumbnails.of("session", openOnly)).toEqual({ ok: false, error: "not_ready" });
    expect(extractor).not.toHaveBeenCalled();
  });

  it("n'extrait rien avant le segment d'init", async () => {
    const { extractor, thumbnails } = setup();

    const withoutInit = { ...WITH_CLOSED_SEGMENTS, init: undefined };

    expect(await thumbnails.of("session", withoutInit)).toEqual({
      ok: false,
      error: "not_ready",
    });
    expect(extractor).not.toHaveBeenCalled();
  });

  it("garde la vignette 30 s après l'extraction, puis en extrait une nouvelle", async () => {
    const { clock, extractor, thumbnails } = setup();
    await thumbnails.of("session", WITH_CLOSED_SEGMENTS);

    clock.now += TTL_MS - 1;
    await thumbnails.of("session", WITH_CLOSED_SEGMENTS);
    expect(extractor).toHaveBeenCalledTimes(1);

    clock.now += 1;
    await thumbnails.of("session", WITH_CLOSED_SEGMENTS);
    expect(extractor).toHaveBeenCalledTimes(2);
  });

  it("compte les 30 s depuis la fin de l'extraction, pas depuis son début", async () => {
    const pending = deferred<Uint8Array | undefined>();
    const { clock, extractor, thumbnails } = setup({ extract: () => pending.promise });
    const first = thumbnails.of("session", WITH_CLOSED_SEGMENTS);

    clock.now += TTL_MS * 2;
    pending.resolve(JPEG);
    await first;
    clock.now += TTL_MS - 1;
    await thumbnails.of("session", WITH_CLOSED_SEGMENTS);

    expect(extractor).toHaveBeenCalledTimes(1);
  });

  it("ne lance qu'une extraction à la fois par session, les demandes suivantes l'attendent", async () => {
    const pending = deferred<Uint8Array | undefined>();
    const { clock, extractor, thumbnails } = setup({ extract: () => pending.promise });

    const first = thumbnails.of("session", WITH_CLOSED_SEGMENTS);
    clock.now += TTL_MS * 2;
    const second = thumbnails.of("session", WITH_CLOSED_SEGMENTS);
    pending.resolve(JPEG);

    expect(await Promise.all([first, second])).toEqual([
      { ok: true, value: JPEG },
      { ok: true, value: JPEG },
    ]);
    expect(extractor).toHaveBeenCalledTimes(1);
  });

  it("extrait séparément la vignette de chaque session", async () => {
    const { extractor, thumbnails } = setup();

    await thumbnails.of("session-a", WITH_CLOSED_SEGMENTS);
    await thumbnails.of("session-b", WITH_CLOSED_SEGMENTS);

    expect(extractor).toHaveBeenCalledTimes(2);
  });

  it("rend un échec quand ffmpeg ne rend pas d'image, et le garde 30 s", async () => {
    const { clock, extractor, thumbnails } = setup({ extract: async () => undefined });

    expect(await thumbnails.of("session", WITH_CLOSED_SEGMENTS)).toEqual({
      ok: false,
      error: "failed",
    });
    clock.now += TTL_MS - 1;
    expect(await thumbnails.of("session", WITH_CLOSED_SEGMENTS)).toEqual({
      ok: false,
      error: "failed",
    });
    expect(extractor).toHaveBeenCalledTimes(1);
  });

  it("rend un échec quand l'extraction lève une erreur", async () => {
    const { thumbnails } = setup({ extract: () => Promise.reject(new Error("spawn ENOENT")) });

    expect(await thumbnails.of("session", WITH_CLOSED_SEGMENTS)).toEqual({
      ok: false,
      error: "failed",
    });
  });

  it("oublie les vignettes expirées, quelle que soit leur session", async () => {
    const { clock, thumbnails } = setup();
    await thumbnails.of("session-a", WITH_CLOSED_SEGMENTS);
    await thumbnails.of("session-b", WITH_CLOSED_SEGMENTS);
    expect(thumbnails.size()).toBe(2);

    clock.now += TTL_MS;
    await thumbnails.of("session-c", WITH_CLOSED_SEGMENTS);

    expect(thumbnails.size()).toBe(1);
  });

  it("garde une extraction en cours lors du ménage", async () => {
    const pending = deferred<Uint8Array | undefined>();
    const { clock, thumbnails } = setup({ extract: () => pending.promise });
    const first = thumbnails.of("session-a", WITH_CLOSED_SEGMENTS);

    clock.now += TTL_MS * 2;
    await thumbnails.of("session-b", makeStream(new Uint8Array(0)));
    expect(thumbnails.size()).toBe(1);
    pending.resolve(JPEG);
    await first;
  });
});
