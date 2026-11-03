import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { concatBytes } from "../segmenter/bytes.ts";
import {
  FFMPEG_FRAGMENTED_MP4,
  FFMPEG_TRAILING_MFRA_SIZE,
  makeFragment,
  makeInit,
} from "../segmenter/testing/fmp4-fixtures.ts";
import {
  endHlsStream,
  feedHlsStream,
  type HlsStream,
  type HlsStreamOptions,
  openSegmentOf,
  startHlsStream,
} from "./hls-stream.ts";

const OPTIONS: HlsStreamOptions = {
  maxBoxSize: 1 << 20,
  targetSeconds: 2,
  targetDuration: 4,
  partTarget: 0.334,
  capacity: 6,
  maxSegmentBytes: 1 << 20,
};

const feedAll = (pieces: readonly Uint8Array[], options: HlsStreamOptions = OPTIONS) =>
  pieces.reduce<HlsStream>((stream, piece) => {
    const step = feedHlsStream(stream, piece);
    if (!step.ok) {
      throw new Error(step.error);
    }
    return step.value;
  }, startHlsStream(options));

const fingerprint = (segments: HlsStream["segments"]) =>
  segments.map((segment) => ({
    ...segment,
    bytes: Buffer.from(segment.bytes).toString("base64"),
    parts: segment.parts.map((part) => ({
      ...part,
      bytes: Buffer.from(part.bytes).toString("base64"),
    })),
  }));

const VIDEO_TRACK = { id: 1, handler: "vide", timescale: 1000 };

describe("flux HLS d'une session", () => {
  it("n'a ni segment d'init ni segment avant les premiers octets, même terminé", () => {
    const stream = startHlsStream(OPTIONS);

    expect(stream).toMatchObject({ init: undefined, segments: [], ended: false });
    expect(endHlsStream(stream)).toMatchObject({ init: undefined, segments: [], ended: true });
  });

  it("rend le segment d'init de ffmpeg et ses segments fermés", () => {
    const stream = feedAll([FFMPEG_FRAGMENTED_MP4]);

    expect(stream.init?.bytes).toEqual(FFMPEG_FRAGMENTED_MP4.subarray(0, 1269));
    expect(stream.segments.map((segment) => segment.sequence)).toEqual([0, 1]);
  });

  it("annonce dès l'ouverture la durée cible fixée, et la garde pour des segments plus courts", () => {
    expect(startHlsStream(OPTIONS).targetDuration).toBe(4);
    expect(endHlsStream(feedAll([FFMPEG_FRAGMENTED_MP4])).targetDuration).toBe(4);
  });

  it("ferme le dernier segment et marque la fin du live", () => {
    const stream = endHlsStream(feedAll([FFMPEG_FRAGMENTED_MP4]));

    expect(stream.segments.map((segment) => segment.sequence)).toEqual([0, 1, 2]);
    expect(stream.ended).toBe(true);
  });

  it("rend le même flux quel que soit le découpage des octets", () => {
    const expected = fingerprint(endHlsStream(feedAll([FFMPEG_FRAGMENTED_MP4])).segments);

    fc.assert(
      fc.property(
        fc.array(fc.nat({ max: FFMPEG_FRAGMENTED_MP4.length }), { maxLength: 30 }),
        (cuts) => {
          const points = [...new Set(cuts)].toSorted((a, b) => a - b);
          const pieces = [0, ...points].map((start, index) =>
            FFMPEG_FRAGMENTED_MP4.subarray(start, [...points, FFMPEG_FRAGMENTED_MP4.length][index]),
          );
          expect(fingerprint(endHlsStream(feedAll(pieces)).segments)).toEqual(expected);
        },
      ),
      { numRuns: 30 },
    );
  });

  it("ne garde en attente que les octets d'une boîte incomplète", () => {
    const stream = feedAll([FFMPEG_FRAGMENTED_MP4.subarray(0, -FFMPEG_TRAILING_MFRA_SIZE + 10)]);

    expect(stream.pending).toHaveLength(10);
  });

  it("relève la durée cible pour un segment plus long, et la garde quand il sort du tampon", () => {
    const fragments = [3000, 2000, 2000, 2000].map((duration, index, all) =>
      makeFragment({
        trackId: 1,
        decodeTime: all.slice(0, index).reduce((total, value) => total + value, 0),
        defaultFlags: 0x0200_0000,
        samples: [{ duration }],
      }),
    );

    const stream = endHlsStream(
      feedAll([makeInit({ tracks: [VIDEO_TRACK] }), ...fragments], {
        ...OPTIONS,
        targetDuration: 2,
        capacity: 1,
      }),
    );

    expect(stream.segments.map((segment) => segment.seconds)).toEqual([2]);
    expect(stream.targetDuration).toBe(3);
  });
});

describe("parts du LL-HLS", () => {
  const keyframeFragments = (durations: readonly number[]) =>
    durations.map((duration, index) =>
      makeFragment({
        trackId: 1,
        decodeTime: durations.slice(0, index).reduce((total, value) => total + value, 0),
        defaultFlags: 0x0200_0000,
        samples: [{ duration }],
      }),
    );

  it("rend les parts du segment ouvert sous le numéro du prochain segment", () => {
    const stream = feedAll([
      makeInit({ tracks: [VIDEO_TRACK] }),
      ...keyframeFragments([2000, 300, 200]),
    ]);

    expect(openSegmentOf(stream).sequence).toBe(1);
    expect(openSegmentOf(stream).parts.map(({ seconds }) => seconds)).toEqual([0.3, 0.2]);
    expect(openSegmentOf(startHlsStream(OPTIONS))).toEqual({ sequence: 0, parts: [] });
  });

  it("annonce la durée cible des parts fixée, et la relève pour une part plus longue, même ouverte", () => {
    expect(startHlsStream(OPTIONS).partTarget).toBe(0.334);
    expect(
      feedAll([makeInit({ tracks: [VIDEO_TRACK] }), ...keyframeFragments([300, 450])]).partTarget,
    ).toBe(0.45);
    expect(
      feedAll([makeInit({ tracks: [VIDEO_TRACK] }), ...keyframeFragments([2500, 300, 300])])
        .partTarget,
    ).toBe(2.5);
  });
});

describe("refus du flux", () => {
  it("refuse une boîte au-delà du plafond de la session", () => {
    expect(
      feedHlsStream(startHlsStream({ ...OPTIONS, maxBoxSize: 64 }), FFMPEG_FRAGMENTED_MP4),
    ).toEqual({
      ok: false,
      error: "box_too_large",
    });
  });

  it("relaie le refus du lecteur fMP4", () => {
    const stream = startHlsStream(OPTIONS);

    expect(
      feedHlsStream(stream, makeFragment({ trackId: 1, decodeTime: 0, samples: [{}] })),
    ).toEqual({
      ok: false,
      error: "fragment_before_init",
    });
  });

  it("refuse un second segment d'init dans la même session", () => {
    const init = makeInit({ tracks: [VIDEO_TRACK] });

    const fragment = makeFragment({ trackId: 1, decodeTime: 0, samples: [{}] });

    expect(feedHlsStream(startHlsStream(OPTIONS), concatBytes(init, init, fragment))).toEqual({
      ok: false,
      error: "init_changed",
    });
  });
});
