import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { concatBytes } from "./bytes.ts";
import {
  type Fmp4Fragment,
  type Fmp4Init,
  type Fmp4Reader,
  readFmp4,
  startFmp4Reader,
} from "./fmp4-reader.ts";
import {
  appendFragment,
  closeSegmenter,
  type Segment,
  type Segmenter,
  type SegmenterOptions,
  startSegmenter,
} from "./segmenter.ts";
import { FFMPEG_FRAGMENTED_MP4, FFMPEG_VIDEO_TIMESCALE } from "./testing/fmp4-fixtures.ts";

const LIMITS = { maxBoxSize: 1 << 20 };

const OPTIONS: SegmenterOptions = {
  targetSeconds: 2,
  capacity: 100,
  maxSegmentBytes: 1 << 20,
};

const MILLISECONDS: Fmp4Init = { bytes: Uint8Array.of(1, 2, 3), videoTrackId: 1, timescale: 1000 };

const makeFmp4Fragment = ({
  decodeTime,
  duration = 500,
  keyframe = false,
  size = 1,
}: {
  readonly decodeTime: number;
  readonly duration?: number;
  readonly keyframe?: boolean;
  readonly size?: number;
}): Fmp4Fragment => ({
  bytes: new Uint8Array(size).fill(decodeTime % 251),
  decodeTime,
  duration,
  keyframe,
});

const KEYFRAME = { keyframe: true };

const appendAll = (segmenter: Segmenter, fragments: readonly Fmp4Fragment[]): Segmenter =>
  fragments.reduce(appendFragment, segmenter);

const readFixture = () => {
  const step = readFmp4({ reader: startFmp4Reader(LIMITS), input: FFMPEG_FRAGMENTED_MP4 });
  if (!step.ok) {
    throw new Error(step.error);
  }
  const [first, ...rest] = step.value.events;
  if (first?.kind !== "init") {
    throw new Error("le fMP4 de ffmpeg s'ouvre sur son segment d'init");
  }
  return {
    init: first.init,
    fragments: rest.flatMap((event) => (event.kind === "fragment" ? [event.fragment] : [])),
  };
};

const segmentFixture = (options: SegmenterOptions = OPTIONS) => {
  const { init, fragments } = readFixture();
  return closeSegmenter(appendAll(startSegmenter({ init, ...options }), fragments));
};

const slices = (bytes: Uint8Array, cuts: readonly number[]): readonly Uint8Array[] => {
  const points = [...new Set(cuts.map((cut) => cut % bytes.length))].toSorted((a, b) => a - b);
  return [0, ...points].map((start, index) =>
    bytes.subarray(start, [...points, bytes.length][index]),
  );
};

const fingerprint = (segments: readonly Segment[]) =>
  segments.map((segment) => ({
    ...segment,
    bytes: Buffer.from(segment.bytes).toString("base64"),
  }));

const segmentPieces = (pieces: readonly Uint8Array[]): Segmenter | undefined => {
  const last = pieces.reduce<{
    reader: Fmp4Reader;
    buffered: Uint8Array;
    segmenter: Segmenter | undefined;
  }>(
    (state, piece) => {
      const input = concatBytes(state.buffered, piece);
      const step = readFmp4({ reader: state.reader, input });
      if (!step.ok) {
        throw new Error(step.error);
      }
      return {
        reader: step.value.reader,
        buffered: input.subarray(step.value.consumed),
        segmenter: step.value.events.reduce<Segmenter | undefined>(
          (segmenter, event) =>
            event.kind === "init"
              ? startSegmenter({ init: event.init, ...OPTIONS })
              : segmenter && appendFragment(segmenter, event.fragment),
          state.segmenter,
        ),
      };
    },
    { reader: startFmp4Reader(LIMITS), buffered: new Uint8Array(0), segmenter: undefined },
  );
  return last.segmenter && closeSegmenter(last.segmenter);
};

describe("segmentation du fMP4 de ffmpeg", () => {
  it("rend les mêmes segments quel que soit le découpage des octets sortis de ffmpeg", () => {
    const expected = fingerprint(segmentFixture().segments);

    fc.assert(
      fc.property(fc.array(fc.nat(), { maxLength: 40 }), (cuts) => {
        const segments = segmentPieces(slices(FFMPEG_FRAGMENTED_MP4, cuts))?.segments ?? [];
        expect(fingerprint(segments)).toEqual(expected);
      }),
      { numRuns: 50 },
    );
  });

  it("coupe des segments d'au moins 2 secondes, à la première image clé qui suit", () => {
    const { segments } = segmentFixture();

    expect(segments.map((segment) => segment.seconds)).toEqual([
      38_831 / FFMPEG_VIDEO_TIMESCALE,
      36_864 / FFMPEG_VIDEO_TIMESCALE,
      33_792 / FFMPEG_VIDEO_TIMESCALE,
    ]);
    expect(segments.map((segment) => segment.sequence)).toEqual([0, 1, 2]);
  });

  it("ouvre chaque segment sur une image clé, relu par le lecteur derrière le segment d'init", () => {
    const { init, segments } = segmentFixture();

    segments.forEach((segment) => {
      const step = readFmp4({
        reader: startFmp4Reader(LIMITS),
        input: concatBytes(init.bytes, segment.bytes),
      });
      expect(step.ok && step.value.events[1]).toMatchObject({
        kind: "fragment",
        fragment: { keyframe: true },
      });
    });
  });

  it("garde tous les fragments, dans l'ordre, sans en ajouter", () => {
    const { init, fragments } = readFixture();

    const { segments } = segmentFixture();

    expect(concatBytes(...segments.map((segment) => segment.bytes))).toEqual(
      concatBytes(...fragments.map((fragment) => fragment.bytes)),
    );
    expect(segmentFixture().init).toEqual(init);
  });
});

describe("découpe", () => {
  it("écarte les fragments qui précèdent la première image clé", () => {
    const segmenter = appendAll(startSegmenter({ init: MILLISECONDS, ...OPTIONS }), [
      makeFmp4Fragment({ decodeTime: 0 }),
      makeFmp4Fragment({ decodeTime: 500, ...KEYFRAME }),
      makeFmp4Fragment({ decodeTime: 1000 }),
    ]);

    expect(closeSegmenter(segmenter).segments).toEqual([
      {
        sequence: 0,
        seconds: 1,
        bytes: concatBytes(
          makeFmp4Fragment({ decodeTime: 500 }).bytes,
          makeFmp4Fragment({ decodeTime: 1000 }).bytes,
        ),
      },
    ]);
  });

  it("ne coupe pas sur une image clé tant que le segment ouvert n'atteint pas la cible", () => {
    const segmenter = appendAll(startSegmenter({ init: MILLISECONDS, ...OPTIONS }), [
      makeFmp4Fragment({ decodeTime: 0, duration: 1999, ...KEYFRAME }),
      makeFmp4Fragment({ decodeTime: 1999, duration: 1, ...KEYFRAME }),
      makeFmp4Fragment({ decodeTime: 2000, ...KEYFRAME }),
    ]);

    expect(segmenter.segments.map((segment) => segment.seconds)).toEqual([2]);
  });

  it("prolonge le segment au-delà de la cible jusqu'à la prochaine image clé", () => {
    const segmenter = appendAll(startSegmenter({ init: MILLISECONDS, ...OPTIONS }), [
      makeFmp4Fragment({ decodeTime: 0, duration: 2000, ...KEYFRAME }),
      makeFmp4Fragment({ decodeTime: 2000, duration: 1500 }),
      makeFmp4Fragment({ decodeTime: 3500, ...KEYFRAME }),
    ]);

    expect(segmenter.segments.map((segment) => segment.seconds)).toEqual([3.5]);
  });

  it("ne rend un segment qu'une fois fermé par l'image clé suivante ou par la fin du flux", () => {
    const segmenter = appendAll(startSegmenter({ init: MILLISECONDS, ...OPTIONS }), [
      makeFmp4Fragment({ decodeTime: 0, duration: 5000, ...KEYFRAME }),
    ]);

    expect(segmenter.segments).toEqual([]);
    expect(closeSegmenter(segmenter).segments.map((segment) => segment.seconds)).toEqual([5]);
    expect(closeSegmenter(closeSegmenter(segmenter)).segments).toHaveLength(1);
  });

  it("abandonne un segment qui dépasse sa taille maximale et attend l'image clé suivante", () => {
    const segmenter = appendAll(
      startSegmenter({ init: MILLISECONDS, ...OPTIONS, maxSegmentBytes: 10 }),
      [
        makeFmp4Fragment({ decodeTime: 0, size: 6, ...KEYFRAME }),
        makeFmp4Fragment({ decodeTime: 500, size: 5 }),
        makeFmp4Fragment({ decodeTime: 1000, size: 1 }),
        makeFmp4Fragment({ decodeTime: 1500, size: 11, ...KEYFRAME }),
        makeFmp4Fragment({ decodeTime: 2000, size: 1 }),
        makeFmp4Fragment({ decodeTime: 2500, size: 10, ...KEYFRAME }),
      ],
    );

    expect(closeSegmenter(segmenter).segments).toEqual([
      { sequence: 0, seconds: 0.5, bytes: makeFmp4Fragment({ decodeTime: 2500, size: 10 }).bytes },
    ]);
  });
});

const keyframesEvery2Seconds = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    makeFmp4Fragment({ decodeTime: index * 2000, duration: 2000, ...KEYFRAME }),
  );

describe("tampon circulaire", () => {
  it("évince les segments les plus anciens et continue la numérotation", () => {
    const segmenter = appendAll(
      startSegmenter({ init: MILLISECONDS, ...OPTIONS, capacity: 2 }),
      keyframesEvery2Seconds(6),
    );

    expect(closeSegmenter(segmenter).segments.map((segment) => segment.sequence)).toEqual([4, 5]);
  });

  it("garde les derniers segments sans dépasser sa capacité, même nulle", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5 }), fc.nat({ max: 20 }), (capacity, count) => {
        const segmenter = closeSegmenter(
          appendAll(
            startSegmenter({ init: MILLISECONDS, ...OPTIONS, capacity }),
            keyframesEvery2Seconds(count),
          ),
        );

        const kept = Math.min(capacity, count);

        expect(segmenter.segments.map((segment) => segment.sequence)).toEqual(
          Array.from({ length: kept }, (_, index) => count - kept + index),
        );
      }),
    );
  });
});
