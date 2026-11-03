import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { concatBytes } from "./bytes.ts";
import {
  type Fmp4Event,
  type Fmp4Limits,
  type Fmp4Reader,
  readFmp4,
  startFmp4Reader,
} from "./fmp4-reader.ts";
import {
  asLargeBox,
  growBox,
  FFMPEG_FRAGMENT_COUNT,
  FFMPEG_FRAGMENTED_MP4,
  FFMPEG_KEYFRAME_DECODE_TIMES,
  FFMPEG_TRAILING_MFRA_SIZE,
  FFMPEG_VIDEO_TIMESCALE,
  makeBox,
  makeFragment,
  makeFtyp,
  makeFullBox,
  makeInit,
  makeMoov,
  makeLargeBox,
  makeTrex,
  makeTrun,
  NON_SYNC_SAMPLE,
  SYNC_SAMPLE,
} from "./testing/fmp4-fixtures.ts";

const LIMITS: Fmp4Limits = { maxBoxSize: 1 << 20 };

const VIDEO_TRACK = { id: 1, handler: "vide", timescale: 90_000 };
const AUDIO_TRACK = { id: 2, handler: "soun", timescale: 48_000 };

const readAll = (pieces: readonly Uint8Array[], limits: Fmp4Limits = LIMITS) =>
  pieces.reduce<{ reader: Fmp4Reader; buffered: Uint8Array; events: readonly Fmp4Event[] }>(
    (state, piece) => {
      const input = concatBytes(state.buffered, piece);
      const step = readFmp4({ reader: state.reader, input });
      if (!step.ok) {
        throw new Error(step.error);
      }
      return {
        reader: step.value.reader,
        buffered: input.subarray(step.value.consumed),
        events: [...state.events, ...step.value.events],
      };
    },
    { reader: startFmp4Reader(limits), buffered: new Uint8Array(0), events: [] },
  );

const readOnce = (input: Uint8Array, limits: Fmp4Limits = LIMITS) =>
  readFmp4({ reader: startFmp4Reader(limits), input });

const fragments = (events: readonly Fmp4Event[]) =>
  events.flatMap((event) => (event.kind === "fragment" ? [event.fragment] : []));

const slices = (bytes: Uint8Array, cuts: readonly number[]): readonly Uint8Array[] => {
  const points = [...new Set(cuts.map((cut) => cut % bytes.length))].toSorted((a, b) => a - b);
  return [0, ...points].map((start, index) =>
    bytes.subarray(start, [...points, bytes.length][index]),
  );
};

const fingerprint = (events: readonly Fmp4Event[]) =>
  events.map((event) =>
    event.kind === "init"
      ? { ...event.init, bytes: Buffer.from(event.init.bytes).toString("base64") }
      : { ...event.fragment, bytes: Buffer.from(event.fragment.bytes).toString("base64") },
  );

describe("lecture du fMP4 de ffmpeg", () => {
  it("rend un segment d'initialisation puis chaque fragment moof+mdat, octet pour octet, sans le mfra final", () => {
    const { events, buffered } = readAll([FFMPEG_FRAGMENTED_MP4]);

    expect(events[0]).toMatchObject({
      kind: "init",
      init: { videoTrackId: 1, timescale: FFMPEG_VIDEO_TIMESCALE },
    });
    expect(fragments(events)).toHaveLength(FFMPEG_FRAGMENT_COUNT);
    expect(
      concatBytes(
        ...events.map((event) => (event.kind === "init" ? event.init.bytes : event.fragment.bytes)),
      ),
    ).toEqual(FFMPEG_FRAGMENTED_MP4.subarray(0, -FFMPEG_TRAILING_MFRA_SIZE));
    expect(buffered).toHaveLength(0);
  });

  it("repère les fragments qui s'ouvrent sur une image clé, à l'instant de décodage de la vidéo", () => {
    const keyframes = fragments(readAll([FFMPEG_FRAGMENTED_MP4]).events).filter(
      (fragment) => fragment.keyframe,
    );

    expect(keyframes.map((fragment) => fragment.decodeTime)).toEqual(FFMPEG_KEYFRAME_DECODE_TIMES);
  });

  it("donne à chaque fragment la durée qui le sépare du suivant", () => {
    const all = fragments(readAll([FFMPEG_FRAGMENTED_MP4]).events);

    const ends = all.slice(0, -1).map((fragment) => fragment.decodeTime + fragment.duration);

    expect(ends).toEqual(all.slice(1).map((fragment) => fragment.decodeTime));
  });

  it("rend les mêmes événements quel que soit le découpage des octets reçus", () => {
    const expected = fingerprint(readAll([FFMPEG_FRAGMENTED_MP4]).events);

    fc.assert(
      fc.property(fc.array(fc.nat(), { maxLength: 40 }), (cuts) => {
        expect(fingerprint(readAll(slices(FFMPEG_FRAGMENTED_MP4, cuts)).events)).toEqual(expected);
      }),
      { numRuns: 50 },
    );
  });

  it("n'avance pas tant qu'une boîte est incomplète", () => {
    const step = readOnce(FFMPEG_FRAGMENTED_MP4.subarray(0, 7));

    expect(step).toEqual({ ok: true, value: expect.objectContaining({ consumed: 0, events: [] }) });
  });
});

describe("lecture des variantes de fragments", () => {
  const init = makeInit({ tracks: [AUDIO_TRACK, VIDEO_TRACK] });

  it("ne lit que la piste vidéo, et prend la durée et les flags par défaut du tfhd", () => {
    const fragment = makeFragment(
      { trackId: 2, decodeTime: 7, samples: [{ duration: 1024, flags: NON_SYNC_SAMPLE }] },
      {
        trackId: 1,
        decodeTime: 3000,
        tfdtVersion: 0,
        defaultDuration: 3000,
        defaultFlags: SYNC_SAMPLE,
        samples: [{}, {}],
      },
    );

    expect(fragments(readAll([init, fragment]).events)).toEqual([
      { bytes: fragment, decodeTime: 3000, duration: 6000, keyframe: true },
    ]);
  });

  it("lit les durées et les flags échantillon par échantillon", () => {
    const fragment = makeFragment({
      trackId: 1,
      decodeTime: 0,
      defaultFlags: SYNC_SAMPLE,
      samples: [
        { duration: 1000, flags: NON_SYNC_SAMPLE },
        { duration: 2000, flags: SYNC_SAMPLE },
      ],
    });

    expect(fragments(readAll([init, fragment]).events)).toEqual([
      { bytes: fragment, decodeTime: 0, duration: 3000, keyframe: false },
    ]);
  });

  it("préfère les flags du premier échantillon du trun", () => {
    const fragment = makeFragment({
      trackId: 1,
      decodeTime: 0,
      defaultFlags: NON_SYNC_SAMPLE,
      firstSampleFlags: SYNC_SAMPLE,
      samples: [{ duration: 1000, flags: NON_SYNC_SAMPLE }],
    });

    expect(fragments(readAll([init, fragment]).events)[0]?.keyframe).toBe(true);
  });

  it("à défaut du tfhd, prend la durée et les flags du trex de la piste", () => {
    const withTrex = makeInit({
      tracks: [AUDIO_TRACK, { ...VIDEO_TRACK, mdhdVersion: 1 }],
      trex: [
        makeTrex({ trackId: 2, defaultDuration: 1024, defaultFlags: SYNC_SAMPLE }),
        makeTrex({ trackId: 1, defaultDuration: 1500, defaultFlags: NON_SYNC_SAMPLE }),
      ],
    });
    const fragment = makeFragment({ trackId: 1, decodeTime: 0, samples: [{}, {}, {}] });

    const { events } = readAll([withTrex, fragment]);

    expect(events[0]).toMatchObject({ init: { timescale: 90_000 } });
    expect(fragments(events)).toEqual([
      { bytes: fragment, decodeTime: 0, duration: 4500, keyframe: false },
    ]);
  });

  it("sans valeur par défaut nulle part, un échantillon dure 0 et est une image clé", () => {
    const fragment = makeFragment({ trackId: 1, decodeTime: 0, samples: [{}] });

    expect(fragments(readAll([init, fragment]).events)).toEqual([
      { bytes: fragment, decodeTime: 0, duration: 0, keyframe: true },
    ]);
  });

  it("lit les champs optionnels du tfhd avant sa durée et ses flags par défaut", () => {
    const fragment = makeFragment({
      trackId: 1,
      decodeTime: 0,
      baseDataOffset: 7,
      sampleDescriptionIndex: 9,
      defaultDuration: 3000,
      defaultSize: 11,
      defaultFlags: NON_SYNC_SAMPLE,
      samples: [{}, {}],
    });

    expect(fragments(readAll([init, fragment]).events)).toEqual([
      { bytes: fragment, decodeTime: 0, duration: 6000, keyframe: false },
    ]);
  });

  it("lit chaque colonne optionnelle du trun", () => {
    const fragment = makeFragment({
      trackId: 1,
      decodeTime: 0,
      defaultFlags: SYNC_SAMPLE,
      dataOffset: 13,
      samples: [
        { duration: 1000, size: 17, flags: NON_SYNC_SAMPLE, compositionOffset: 19 },
        { duration: 2000, size: 23, flags: SYNC_SAMPLE, compositionOffset: 29 },
      ],
    });

    expect(fragments(readAll([init, fragment]).events)).toEqual([
      { bytes: fragment, decodeTime: 0, duration: 3000, keyframe: false },
    ]);
  });

  it("additionne les trun d'un traf et prend l'image clé du premier", () => {
    const fragment = makeFragment({
      trackId: 1,
      decodeTime: 0,
      samples: [],
      replace: {
        trun: concatBytes(
          makeTrun({ samples: [{ duration: 1000, flags: SYNC_SAMPLE }] }),
          makeTrun({ samples: [{ duration: 2000, flags: NON_SYNC_SAMPLE }] }),
        ),
      },
    });

    expect(fragments(readAll([init, fragment]).events)).toEqual([
      { bytes: fragment, decodeTime: 0, duration: 3000, keyframe: true },
    ]);
  });

  it("lit l'identifiant de piste d'un tkhd en version 1", () => {
    const tkhd = makeFullBox("tkhd", 1, 3, new Uint8Array(16), Uint8Array.of(0, 0, 0, 7));
    const withV1 = makeInit({ tracks: [{ ...VIDEO_TRACK, replace: { tkhd } }] });

    expect(readAll([withV1]).events[0]).toMatchObject({ init: { videoTrackId: 7 } });
  });

  it("ignore un trex trop court et retombe sur aucune valeur par défaut", () => {
    const withShortTrex = makeInit({
      tracks: [VIDEO_TRACK],
      trex: [makeBox("trex"), makeFullBox("trex", 0, 0, Uint8Array.of(0, 0, 0, 1))],
    });
    const fragment = makeFragment({ trackId: 1, decodeTime: 0, samples: [{}] });

    expect(fragments(readAll([withShortTrex, fragment]).events)).toEqual([
      { bytes: fragment, decodeTime: 0, duration: 0, keyframe: true },
    ]);
  });

  it("compte un trun sans colonne par échantillon d'après son seul nombre d'échantillons", () => {
    const fragment = makeFragment({ trackId: 1, decodeTime: 0, defaultDuration: 2, samples: [{}] });
    const trun = fragment.findIndex(
      (_, index) => String.fromCharCode(...fragment.subarray(index, index + 4)) === "trun",
    );
    const forged = new Uint8Array(fragment);
    new DataView(forged.buffer).setUint32(trun + 8, 0xff_ff_ff_ff);

    expect(fragments(readAll([init, forged]).events)[0]?.duration).toBe(2 * 0xff_ff_ff_ff);
  });

  it("lit un moov à taille sur 64 bits, sans ftyp devant lui", () => {
    const moov = asLargeBox(makeMoov({ tracks: [VIDEO_TRACK] }));

    expect(readAll([moov]).events).toEqual([
      { kind: "init", init: { bytes: moov, videoTrackId: 1, timescale: 90_000 } },
    ]);
  });

  it("forme le segment d'init du dernier ftyp et du moov, sans les autres boîtes", () => {
    const ftyp = makeFtyp();
    const moov = makeMoov({ tracks: [VIDEO_TRACK] });
    const nextMoov = makeMoov({ tracks: [{ ...VIDEO_TRACK, id: 3 }] });

    const { events } = readAll([
      makeBox("ftyp"),
      ftyp,
      makeBox("free"),
      moov,
      makeBox("free"),
      nextMoov,
    ]);

    expect(events).toEqual([
      {
        kind: "init",
        init: { bytes: concatBytes(ftyp, moov), videoTrackId: 1, timescale: 90_000 },
      },
      {
        kind: "init",
        init: { bytes: concatBytes(ftyp, nextMoov), videoTrackId: 3, timescale: 90_000 },
      },
    ]);
  });

  it("accepte des boîtes de la taille exacte du plafond", () => {
    const free = makeBox("free", new Uint8Array(56));

    expect(readOnce(concatBytes(free, free), { maxBoxSize: 64 })).toEqual({
      ok: true,
      value: expect.objectContaining({ consumed: 128 }),
    });
  });

  it("lit une boîte à taille sur 64 bits et ignore les boîtes inconnues", () => {
    const fragment = makeFragment({ trackId: 1, decodeTime: 0, samples: [{ duration: 10 }] });

    const { events } = readAll([init, makeLargeBox("free"), makeBox("styp"), fragment]);

    expect(fragments(events)).toEqual([
      { bytes: fragment, decodeTime: 0, duration: 10, keyframe: true },
    ]);
  });
});

describe("refus", () => {
  const init = makeInit({ tracks: [VIDEO_TRACK] });

  it.each([
    ["une taille de boîte inférieure à son en-tête", makeBox("ftyp").fill(0, 0, 4).fill(4, 3, 4)],
    ["une boîte qui s'étend jusqu'à la fin du flux", makeBox("ftyp").fill(0, 0, 4)],
    ["une taille sur 64 bits inférieure à son en-tête", makeLargeBox("free").fill(0, 8, 16)],
  ])("refuse %s", (_, bytes) => {
    expect(readOnce(bytes)).toEqual({ ok: false, error: "malformed_box" });
  });

  it("attend la suite d'un en-tête de boîte à taille sur 64 bits", () => {
    const step = readOnce(makeLargeBox("free", new Uint8Array(4)).subarray(0, 12));

    expect(step).toEqual({ ok: true, value: expect.objectContaining({ consumed: 0, events: [] }) });
  });

  it("refuse une boîte plus grande que le plafond, avant de l'avoir reçue", () => {
    expect(
      readOnce(makeBox("mdat", new Uint8Array(64)).subarray(0, 8), { maxBoxSize: 64 }),
    ).toEqual({ ok: false, error: "box_too_large" });
  });

  it("refuse un fragment avant le moov", () => {
    expect(readOnce(makeFragment({ trackId: 1, decodeTime: 0, samples: [{}] }))).toEqual({
      ok: false,
      error: "fragment_before_init",
    });
  });

  it("refuse un mdat sans moof", () => {
    expect(readOnce(concatBytes(init, makeBox("mdat")))).toEqual({
      ok: false,
      error: "mdat_without_moof",
    });
  });

  it("refuse un moov sans piste vidéo", () => {
    expect(readOnce(makeInit({ tracks: [AUDIO_TRACK] }))).toEqual({
      ok: false,
      error: "no_video_track",
    });
  });

  it.each([
    ["sans mdia", { mdia: makeBox("udta") }],
    ["sans mdhd", { mdhd: makeBox("udta") }],
    ["au hdlr vide, en fin de moov", { hdlr: makeBox("hdlr") }],
    ["au hdlr trop court pour son type", { hdlr: makeFullBox("hdlr", 0, 0, new Uint8Array(4)) }],
    ["au tkhd vide", { tkhd: makeBox("tkhd") }],
    [
      "au tkhd trop court pour son identifiant",
      { tkhd: makeFullBox("tkhd", 0, 0, new Uint8Array(8)) },
    ],
    [
      "au mdhd trop court pour son échelle de temps",
      { mdhd: makeFullBox("mdhd", 1, 0, new Uint8Array(16)) },
    ],
  ])("refuse un moov dont la piste vidéo est %s", (_, replace) => {
    expect(readOnce(makeInit({ tracks: [{ ...VIDEO_TRACK, replace }] }))).toEqual({
      ok: false,
      error: "no_video_track",
    });
  });

  it.each([
    ["un tfhd trop court pour son identifiant de piste", { tfhd: makeFullBox("tfhd", 0, 0) }],
    [
      "un tfhd trop court pour les flags qu'il annonce",
      { tfhd: makeFullBox("tfhd", 0, 0x20, Uint8Array.of(0, 0, 0, 1)) },
    ],
    ["un tfdt en version 1 trop court", { tfdt: makeFullBox("tfdt", 1, 0, new Uint8Array(4)) }],
    ["un tfdt en version 0 vide", { tfdt: makeFullBox("tfdt", 0, 0) }],
    ["aucun trun", { trun: makeBox("free") }],
    ["un trun sans nombre d'échantillons", { trun: makeFullBox("trun", 0, 0) }],
    ["un trun sans échantillon", { trun: makeTrun({ samples: [] }) }],
    [
      "un second trun invalide",
      { trun: concatBytes(makeTrun({ samples: [{ duration: 1 }] }), makeFullBox("trun", 0, 0)) },
    ],
  ])("refuse un fragment vidéo avec %s", (_, replace) => {
    const fragment = makeFragment({ trackId: 1, decodeTime: 0, samples: [{}], replace });

    expect(readOnce(concatBytes(init, fragment))).toEqual({
      ok: false,
      error: "malformed_fragment",
    });
  });

  it("refuse une piste vidéo qui déborde de son moov", () => {
    expect(readOnce(growBox(makeInit({ tracks: [VIDEO_TRACK] }), "trak", 1))).toEqual({
      ok: false,
      error: "no_video_track",
    });
  });

  it("refuse un moof sans traf de la piste vidéo", () => {
    expect(
      readOnce(concatBytes(init, makeFragment({ trackId: 2, decodeTime: 0, samples: [{}] }))),
    ).toEqual({ ok: false, error: "malformed_fragment" });
  });

  it("refuse un trun qui annonce plus d'échantillons que sa boîte n'en contient", () => {
    const fragment = makeFragment({ trackId: 1, decodeTime: 0, samples: [{ duration: 1 }] });
    const trun = fragment.findIndex(
      (_, index) => String.fromCharCode(...fragment.subarray(index, index + 4)) === "trun",
    );
    const forged = new Uint8Array(fragment);
    new DataView(forged.buffer).setUint32(trun + 8, 1000);

    expect(readOnce(concatBytes(init, forged))).toEqual({ ok: false, error: "malformed_fragment" });
  });

  it("parcourt un moof de cent mille boîtes sans épuiser la pile", () => {
    const tiny = makeBox("free");
    const moof = makeBox(
      "moof",
      Uint8Array.from(
        { length: 100_000 * tiny.length },
        (_, index) => tiny[index % tiny.length] ?? 0,
      ),
    );

    expect(readOnce(concatBytes(init, moof))).toEqual({ ok: false, error: "malformed_fragment" });
  });

  it("ne plante sur aucune suite d'octets après un moov valide", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 512 }), (noise) => {
        const step = readOnce(concatBytes(init, makeBox("moof", noise), makeBox("mdat")));
        expect(typeof step.ok).toBe("boolean");
      }),
      { numRuns: 300 },
    );
  });
});
