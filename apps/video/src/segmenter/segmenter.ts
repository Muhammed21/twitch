import { concatBytes } from "./bytes.ts";
import type { Fmp4Fragment, Fmp4Init } from "./fmp4-reader.ts";

export type SegmenterOptions = {
  readonly targetSeconds: number;
  readonly capacity: number;
  readonly maxSegmentBytes: number;
};

export type Segment = {
  readonly sequence: number;
  readonly seconds: number;
  readonly bytes: Uint8Array;
};

type OpenSegment = {
  readonly fragments: readonly Fmp4Fragment[];
  readonly size: number;
  readonly duration: number;
};

export type Segmenter = {
  readonly options: SegmenterOptions;
  readonly init: Fmp4Init;
  readonly segments: readonly Segment[];
  readonly nextSequence: number;
  readonly open: OpenSegment | undefined;
};

export const startSegmenter = ({
  init,
  ...options
}: SegmenterOptions & { readonly init: Fmp4Init }): Segmenter => ({
  options,
  init,
  segments: [],
  nextSequence: 0,
  open: undefined,
});

const withFragment = (open: OpenSegment, fragment: Fmp4Fragment): OpenSegment => ({
  fragments: [...open.fragments, fragment],
  size: open.size + fragment.bytes.length,
  duration: open.duration + fragment.duration,
});

const EMPTY: OpenSegment = { fragments: [], size: 0, duration: 0 };

const sealed = (segmenter: Segmenter): Segmenter => {
  const { open, options, init, nextSequence } = segmenter;
  if (open === undefined) {
    return segmenter;
  }
  const segment = {
    sequence: nextSequence,
    seconds: open.duration / init.timescale,
    bytes: concatBytes(...open.fragments.map((fragment) => fragment.bytes)),
  };
  return {
    ...segmenter,
    segments: [...segmenter.segments, segment].slice(-options.capacity),
    nextSequence: nextSequence + 1,
    open: undefined,
  };
};

const reachesTarget = (segmenter: Segmenter, open: OpenSegment): boolean =>
  open.duration >= segmenter.options.targetSeconds * segmenter.init.timescale;

export const appendFragment = (segmenter: Segmenter, fragment: Fmp4Fragment): Segmenter => {
  const { open } = segmenter;
  const cut = fragment.keyframe && (open === undefined || reachesTarget(segmenter, open));
  const current = cut ? sealed(segmenter) : segmenter;
  const base = cut ? EMPTY : current.open;
  const next = base === undefined ? undefined : withFragment(base, fragment);
  return {
    ...current,
    open: next !== undefined && next.size <= segmenter.options.maxSegmentBytes ? next : undefined,
  };
};

export const closeSegmenter = (segmenter: Segmenter): Segmenter => sealed(segmenter);
