import { err, ok, type Result } from "@repo/result";

import { concatBytes } from "./bytes.ts";

const BOX_HEADER = 8;
const LARGE_BOX_HEADER = 16;
const LARGE_SIZE = 1;
const TFHD_BASE_DATA_OFFSET = 0x1;
const TFHD_SAMPLE_DESCRIPTION = 0x2;
const TFHD_DEFAULT_DURATION = 0x8;
const TFHD_DEFAULT_SIZE = 0x10;
const TFHD_DEFAULT_FLAGS = 0x20;
const TRUN_DATA_OFFSET = 0x1;
const TRUN_FIRST_FLAGS = 0x4;
const TRUN_DURATION = 0x100;
const TRUN_SIZE = 0x200;
const TRUN_FLAGS = 0x400;
const TRUN_COMPOSITION = 0x800;
const NON_SYNC_SAMPLE = 0x1_0000;

export type Fmp4Limits = { readonly maxBoxSize: number };

export type Fmp4Init = {
  readonly bytes: Uint8Array;
  readonly videoTrackId: number;
  readonly timescale: number;
};

export type Fmp4Fragment = {
  readonly bytes: Uint8Array;
  readonly decodeTime: number;
  readonly duration: number;
  readonly keyframe: boolean;
};

export type Fmp4Event =
  | { readonly kind: "init"; readonly init: Fmp4Init }
  | { readonly kind: "fragment"; readonly fragment: Fmp4Fragment };

export type Fmp4Refusal =
  | "malformed_box"
  | "box_too_large"
  | "fragment_before_init"
  | "mdat_without_moof"
  | "no_video_track"
  | "malformed_fragment";

type SampleDefaults = { readonly duration: number; readonly flags: number };

type VideoTrack = SampleDefaults & { readonly id: number };

type Timing = Omit<Fmp4Fragment, "bytes">;

type Run = { readonly firstFlags: number; readonly duration: number };

export type Fmp4Reader = {
  readonly limits: Fmp4Limits;
  readonly ftyp: Uint8Array | undefined;
  readonly video: VideoTrack | undefined;
  readonly moof: { readonly bytes: Uint8Array; readonly timing: Timing } | undefined;
};

type Box = {
  readonly type: string;
  readonly start: number;
  readonly body: number;
  readonly end: number;
};

type Step = { readonly reader: Fmp4Reader; readonly events: readonly Fmp4Event[] };

type Fields = {
  readonly box: Box;
  readonly version: number;
  readonly flags: number;
  readonly fits: (length: number) => boolean;
  readonly uint32: (offset: number) => number;
  readonly uint64: (offset: number) => number;
};

export const startFmp4Reader = (limits: Fmp4Limits): Fmp4Reader => ({
  limits,
  ftyp: undefined,
  video: undefined,
  moof: undefined,
});

const viewOf = (bytes: Uint8Array): DataView =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

const fourCc = (bytes: Uint8Array, offset: number): string =>
  String.fromCharCode(...bytes.subarray(offset, offset + 4));

const boxAt = (bytes: Uint8Array, offset: number): Result<Box | undefined, "malformed_box"> => {
  if (offset + BOX_HEADER > bytes.length) {
    return ok(undefined);
  }
  const view = viewOf(bytes);
  const size = view.getUint32(offset);
  const type = fourCc(bytes, offset + 4);
  if (size !== LARGE_SIZE) {
    return size < BOX_HEADER
      ? err("malformed_box")
      : ok({ type, start: offset, body: offset + BOX_HEADER, end: offset + size });
  }
  if (offset + LARGE_BOX_HEADER > bytes.length) {
    return ok(undefined);
  }
  const largeSize = Number(view.getBigUint64(offset + BOX_HEADER));
  return largeSize < LARGE_BOX_HEADER
    ? err("malformed_box")
    : ok({ type, start: offset, body: offset + LARGE_BOX_HEADER, end: offset + largeSize });
};

const children = (bytes: Uint8Array, parent: Box, type: string): readonly Box[] => {
  const inside = bytes.subarray(0, parent.end);
  const found: Box[] = [];
  let offset = parent.body;
  for (;;) {
    const box = boxAt(inside, offset);
    if (!box.ok || box.value === undefined || box.value.end > parent.end) {
      return found;
    }
    if (box.value.type === type) {
      found.push(box.value);
    }
    offset = box.value.end;
  }
};

const at = (bytes: Uint8Array, parent: Box, path: readonly string[]): Box | undefined =>
  path.reduce<Box | undefined>(
    (box, type) => (box === undefined ? undefined : children(bytes, box, type)[0]),
    parent,
  );

const fieldsOf = (bytes: Uint8Array, box: Box | undefined): Fields | undefined => {
  if (box === undefined || box.end - box.body < 8) {
    return undefined;
  }
  const view = viewOf(bytes);
  const word = view.getUint32(box.body);
  return {
    box,
    version: word >>> 24,
    flags: word & 0xff_ff_ff,
    fits: (length) => box.body + length <= box.end,
    uint32: (offset) => view.getUint32(box.body + offset),
    uint64: (offset) => Number(view.getBigUint64(box.body + offset)),
  };
};

const optional = (flags: number, flag: number, size = 4): number => (flags & flag ? size : 0);

const handlerOf = (bytes: Uint8Array, trak: Box): string | undefined => {
  const hdlr = fieldsOf(bytes, at(bytes, trak, ["mdia", "hdlr"]));
  return hdlr?.fits(12) ? fourCc(bytes, hdlr.box.body + 8) : undefined;
};

const trexDefaults = (bytes: Uint8Array, moov: Box, trackId: number): SampleDefaults => {
  const mvex = at(bytes, moov, ["mvex"]);
  const trex =
    mvex &&
    children(bytes, mvex, "trex")
      .map((box) => fieldsOf(bytes, box))
      .find((fields) => fields?.fits(24) && fields.uint32(4) === trackId);
  return trex === undefined
    ? { duration: 0, flags: 0 }
    : { duration: trex.uint32(12), flags: trex.uint32(20) };
};

const videoTrackOf = (
  bytes: Uint8Array,
  moov: Box,
): (VideoTrack & { readonly timescale: number }) | undefined => {
  const trak = children(bytes, moov, "trak").find((box) => handlerOf(bytes, box) === "vide");
  const tkhd = trak && fieldsOf(bytes, at(bytes, trak, ["tkhd"]));
  const mdhd = trak && fieldsOf(bytes, at(bytes, trak, ["mdia", "mdhd"]));
  const idAt = tkhd?.version === 1 ? 20 : 12;
  const timescaleAt = mdhd?.version === 1 ? 20 : 12;
  if (!tkhd?.fits(idAt + 4) || !mdhd?.fits(timescaleAt + 4)) {
    return undefined;
  }
  const id = tkhd.uint32(idAt);
  return { id, timescale: mdhd.uint32(timescaleAt), ...trexDefaults(bytes, moov, id) };
};

const runOf = (trun: Fields | undefined, defaults: SampleDefaults): Run | undefined => {
  if (trun === undefined || trun.uint32(4) === 0) {
    return undefined;
  }
  const { flags } = trun;
  const count = trun.uint32(4);
  const firstFlagsAt = 8 + optional(flags, TRUN_DATA_OFFSET);
  const samplesAt = firstFlagsAt + optional(flags, TRUN_FIRST_FLAGS);
  const entrySize =
    optional(flags, TRUN_DURATION) +
    optional(flags, TRUN_SIZE) +
    optional(flags, TRUN_FLAGS) +
    optional(flags, TRUN_COMPOSITION);
  if (!trun.fits(samplesAt + count * entrySize)) {
    return undefined;
  }
  const sampleFlagsAt = samplesAt + optional(flags, TRUN_DURATION) + optional(flags, TRUN_SIZE);
  const firstFlags =
    flags & TRUN_FIRST_FLAGS
      ? trun.uint32(firstFlagsAt)
      : flags & TRUN_FLAGS
        ? trun.uint32(sampleFlagsAt)
        : defaults.flags;
  const duration =
    flags & TRUN_DURATION
      ? Array.from({ length: count }, (_, index) =>
          trun.uint32(samplesAt + index * entrySize),
        ).reduce((total, sample) => total + sample, 0)
      : count * defaults.duration;
  return { firstFlags, duration };
};

const tfhdDefaults = (tfhd: Fields, track: SampleDefaults): SampleDefaults | undefined => {
  const { flags } = tfhd;
  const durationAt =
    8 + optional(flags, TFHD_BASE_DATA_OFFSET, 8) + optional(flags, TFHD_SAMPLE_DESCRIPTION);
  const flagsAt =
    durationAt + optional(flags, TFHD_DEFAULT_DURATION) + optional(flags, TFHD_DEFAULT_SIZE);
  if (!tfhd.fits(flagsAt + optional(flags, TFHD_DEFAULT_FLAGS))) {
    return undefined;
  }
  return {
    duration: flags & TFHD_DEFAULT_DURATION ? tfhd.uint32(durationAt) : track.duration,
    flags: flags & TFHD_DEFAULT_FLAGS ? tfhd.uint32(flagsAt) : track.flags,
  };
};

const timingOf = (bytes: Uint8Array, moof: Box, video: VideoTrack): Timing | undefined => {
  const found = children(bytes, moof, "traf")
    .map((traf) => ({ traf, tfhd: fieldsOf(bytes, at(bytes, traf, ["tfhd"])) }))
    .find(
      (candidate): candidate is { traf: Box; tfhd: Fields } =>
        candidate.tfhd?.uint32(4) === video.id,
    );
  if (found === undefined) {
    return undefined;
  }
  const defaults = tfhdDefaults(found.tfhd, video);
  const tfdt = fieldsOf(bytes, at(bytes, found.traf, ["tfdt"]));
  if (defaults === undefined || !tfdt?.fits(tfdt.version === 1 ? 12 : 8)) {
    return undefined;
  }
  const runs = children(bytes, found.traf, "trun").map((box) =>
    runOf(fieldsOf(bytes, box), defaults),
  );
  const valid = runs.filter((run) => run !== undefined);
  const [first] = valid;
  if (first === undefined || valid.length < runs.length) {
    return undefined;
  }
  return {
    decodeTime: tfdt.version === 1 ? tfdt.uint64(4) : tfdt.uint32(4),
    duration: valid.reduce((total, run) => total + run.duration, 0),
    keyframe: (first.firstFlags & NON_SYNC_SAMPLE) === 0,
  };
};

const readBox = (reader: Fmp4Reader, bytes: Uint8Array, box: Box): Result<Step, Fmp4Refusal> => {
  if (reader.moof !== undefined && box.type !== "mdat") {
    return err("malformed_fragment");
  }
  if (box.type === "moov") {
    const video = videoTrackOf(bytes, box);
    if (video === undefined) {
      return err("no_video_track");
    }
    const init = {
      bytes: concatBytes(reader.ftyp ?? new Uint8Array(0), bytes),
      videoTrackId: video.id,
      timescale: video.timescale,
    };
    return ok({ reader: { ...reader, video }, events: [{ kind: "init", init }] });
  }
  if (box.type === "moof") {
    if (reader.video === undefined) {
      return err("fragment_before_init");
    }
    const timing = timingOf(bytes, box, reader.video);
    return timing === undefined
      ? err("malformed_fragment")
      : ok({ reader: { ...reader, moof: { bytes, timing } }, events: [] });
  }
  if (box.type === "mdat") {
    if (reader.moof === undefined) {
      return err("mdat_without_moof");
    }
    const fragment = { bytes: concatBytes(reader.moof.bytes, bytes), ...reader.moof.timing };
    return ok({ reader: { ...reader, moof: undefined }, events: [{ kind: "fragment", fragment }] });
  }
  return ok({ reader: box.type === "ftyp" ? { ...reader, ftyp: bytes } : reader, events: [] });
};

export const readFmp4 = ({
  reader,
  input,
}: {
  readonly reader: Fmp4Reader;
  readonly input: Uint8Array;
}): Result<
  { readonly reader: Fmp4Reader; readonly consumed: number; readonly events: readonly Fmp4Event[] },
  Fmp4Refusal
> => {
  const events: Fmp4Event[] = [];
  let state = { reader, consumed: 0 };
  for (;;) {
    const box = boxAt(input, state.consumed);
    if (!box.ok) {
      return box;
    }
    if (box.value === undefined) {
      return ok({ ...state, events });
    }
    const { type, start, body, end } = box.value;
    if (end - start > reader.limits.maxBoxSize) {
      return err("box_too_large");
    }
    if (end > input.length) {
      return ok({ ...state, events });
    }
    const step = readBox(state.reader, input.slice(start, end), {
      type,
      start: 0,
      body: body - start,
      end: end - start,
    });
    if (!step.ok) {
      return step;
    }
    events.push(...step.value.events);
    state = { reader: step.value.reader, consumed: end };
  }
};
