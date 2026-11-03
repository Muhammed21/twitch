import { readFileSync } from "node:fs";

import { concatBytes } from "../bytes.ts";

export const FFMPEG_FRAGMENTED_MP4 = new Uint8Array(
  readFileSync(new URL("./ffmpeg-fragmented.mp4", import.meta.url)),
);

export const FFMPEG_VIDEO_TIMESCALE = 15_360;

export const FFMPEG_KEYFRAME_DECODE_TIMES = [
  0, 14_255, 26_543, 38_831, 51_119, 63_407, 75_695, 87_983, 100_271,
];

export const FFMPEG_FRAGMENT_COUNT = 19;

export const FFMPEG_TRAILING_MFRA_SIZE = 794;

const uint32 = (value: number): Uint8Array => {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value);
  return out;
};

const uint64 = (value: number): Uint8Array => {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(value));
  return out;
};

const ascii = (text: string): Uint8Array => new TextEncoder().encode(text);

export const makeBox = (type: string, ...payload: readonly Uint8Array[]): Uint8Array => {
  const body = concatBytes(...payload);
  return concatBytes(uint32(8 + body.length), ascii(type), body);
};

export const makeLargeBox = (type: string, ...payload: readonly Uint8Array[]): Uint8Array => {
  const body = concatBytes(...payload);
  return concatBytes(uint32(1), ascii(type), uint64(16 + body.length), body);
};

export const makeFullBox = (
  type: string,
  version: number,
  flags: number,
  ...payload: readonly Uint8Array[]
): Uint8Array => makeBox(type, uint32(version * 2 ** 24 + flags), ...payload);

export type ReplacedBoxes = Readonly<Record<string, Uint8Array>>;

const orReplaced = (replace: ReplacedBoxes, type: string, built: () => Uint8Array): Uint8Array =>
  replace[type] ?? built();

export type TrackSpec = {
  readonly id: number;
  readonly handler: string;
  readonly timescale: number;
  readonly mdhdVersion?: 0 | 1;
  readonly replace?: ReplacedBoxes;
};

export type TrexSpec = {
  readonly trackId: number;
  readonly defaultDuration: number;
  readonly defaultFlags: number;
};

const makeTrak = ({ id, handler, timescale, mdhdVersion = 0, replace = {} }: TrackSpec) =>
  makeBox(
    "trak",
    orReplaced(replace, "tkhd", () =>
      makeFullBox("tkhd", 0, 3, uint32(0), uint32(0), uint32(id), new Uint8Array(68)),
    ),
    orReplaced(replace, "mdia", () =>
      makeBox(
        "mdia",
        orReplaced(replace, "mdhd", () =>
          mdhdVersion === 1
            ? makeFullBox("mdhd", 1, 0, uint64(0), uint64(0), uint32(timescale), uint64(0))
            : makeFullBox("mdhd", 0, 0, uint32(0), uint32(0), uint32(timescale), uint32(0)),
        ),
        orReplaced(replace, "hdlr", () =>
          makeFullBox("hdlr", 0, 0, uint32(0), ascii(handler), new Uint8Array(13)),
        ),
      ),
    ),
  );

export const makeTrex = ({ trackId, defaultDuration, defaultFlags }: TrexSpec): Uint8Array =>
  makeFullBox(
    "trex",
    0,
    0,
    uint32(trackId),
    uint32(1),
    uint32(defaultDuration),
    uint32(0),
    uint32(defaultFlags),
  );

export type InitSpec = {
  readonly tracks: readonly TrackSpec[];
  readonly trex?: readonly Uint8Array[];
};

export const makeFtyp = (): Uint8Array => makeBox("ftyp", ascii("isom"), uint32(512));

export const makeMoov = ({ tracks, trex }: InitSpec): Uint8Array =>
  makeBox(
    "moov",
    ...tracks.map(makeTrak),
    ...(trex === undefined ? [] : [makeBox("mvex", ...trex)]),
  );

export const makeInit = (spec: InitSpec): Uint8Array => concatBytes(makeFtyp(), makeMoov(spec));

export const asLargeBox = (box: Uint8Array): Uint8Array =>
  makeLargeBox(String.fromCharCode(...box.subarray(4, 8)), box.subarray(8));

export const growBox = (bytes: Uint8Array, type: string, by: number): Uint8Array => {
  const at = bytes.findIndex(
    (_, index) => String.fromCharCode(...bytes.subarray(index + 4, index + 8)) === type,
  );
  const grown = new Uint8Array(bytes);
  const view = new DataView(grown.buffer);
  view.setUint32(at, view.getUint32(at) + by);
  return grown;
};

export type SampleSpec = {
  readonly duration?: number;
  readonly size?: number;
  readonly flags?: number;
  readonly compositionOffset?: number;
};

export type RunSpec = {
  readonly dataOffset?: number;
  readonly firstSampleFlags?: number;
  readonly samples: readonly SampleSpec[];
};

export type TrafSpec = RunSpec & {
  readonly trackId: number;
  readonly decodeTime: number;
  readonly tfdtVersion?: 0 | 1;
  readonly baseDataOffset?: number;
  readonly sampleDescriptionIndex?: number;
  readonly defaultDuration?: number;
  readonly defaultSize?: number;
  readonly defaultFlags?: number;
  readonly replace?: ReplacedBoxes;
};

const present = (value: number | undefined, flag: number): number =>
  value === undefined ? 0 : flag;

const fields = (...values: readonly (Uint8Array | undefined)[]): readonly Uint8Array[] =>
  values.filter((value) => value !== undefined);

const maybe = (value: number | undefined): Uint8Array | undefined =>
  value === undefined ? undefined : uint32(value);

const perSample = (samples: readonly SampleSpec[], key: keyof SampleSpec, flag: number): number =>
  samples.some((sample) => sample[key] !== undefined) ? flag : 0;

export const makeTrun = ({ dataOffset, firstSampleFlags, samples }: RunSpec): Uint8Array => {
  const columns = (
    [
      ["duration", 0x100],
      ["size", 0x200],
      ["flags", 0x400],
      ["compositionOffset", 0x800],
    ] as const
  ).filter(([key, flag]) => perSample(samples, key, flag) !== 0);
  const flags =
    present(dataOffset, 0x1) +
    present(firstSampleFlags, 0x4) +
    columns.reduce((total, [, flag]) => total + flag, 0);
  return makeFullBox(
    "trun",
    0,
    flags,
    uint32(samples.length),
    ...fields(maybe(dataOffset), maybe(firstSampleFlags)),
    ...samples.flatMap((sample) => columns.map(([key]) => uint32(sample[key] ?? 0))),
  );
};

const makeTraf = ({
  trackId,
  decodeTime,
  tfdtVersion = 1,
  baseDataOffset,
  sampleDescriptionIndex,
  defaultDuration,
  defaultSize,
  defaultFlags,
  replace = {},
  ...run
}: TrafSpec): Uint8Array =>
  makeBox(
    "traf",
    orReplaced(replace, "tfhd", () =>
      makeFullBox(
        "tfhd",
        0,
        present(baseDataOffset, 0x1) +
          present(sampleDescriptionIndex, 0x2) +
          present(defaultDuration, 0x8) +
          present(defaultSize, 0x10) +
          present(defaultFlags, 0x20),
        uint32(trackId),
        ...fields(
          baseDataOffset === undefined ? undefined : uint64(baseDataOffset),
          maybe(sampleDescriptionIndex),
          maybe(defaultDuration),
          maybe(defaultSize),
          maybe(defaultFlags),
        ),
      ),
    ),
    orReplaced(replace, "tfdt", () =>
      makeFullBox(
        "tfdt",
        tfdtVersion,
        0,
        tfdtVersion === 1 ? uint64(decodeTime) : uint32(decodeTime),
      ),
    ),
    orReplaced(replace, "trun", () => makeTrun(run)),
  );

export const makeFragment = (...trafs: readonly TrafSpec[]): Uint8Array =>
  concatBytes(
    makeBox("moof", makeFullBox("mfhd", 0, 0, uint32(1)), ...trafs.map(makeTraf)),
    makeBox("mdat", new Uint8Array(4)),
  );

export const SYNC_SAMPLE = 0x0200_0000;
export const NON_SYNC_SAMPLE = 0x0101_0000;
