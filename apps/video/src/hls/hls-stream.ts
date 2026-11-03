import { err, ok, type Result } from "@repo/result";

import { concatBytes } from "../segmenter/bytes.ts";
import {
  type Fmp4Event,
  type Fmp4Init,
  type Fmp4Reader,
  type Fmp4Refusal,
  readFmp4,
  startFmp4Reader,
} from "../segmenter/fmp4-reader.ts";
import {
  appendFragment,
  closeSegmenter,
  type Segment,
  type Segmenter,
  type SegmenterOptions,
  startSegmenter,
} from "../segmenter/segmenter.ts";
import { targetDurationFor } from "./playlist.ts";

export type HlsStreamOptions = SegmenterOptions & { readonly maxBoxSize: number };

export type HlsStreamRefusal = Fmp4Refusal | "init_changed";

export type HlsStream = {
  readonly options: HlsStreamOptions;
  readonly reader: Fmp4Reader;
  readonly pending: Uint8Array;
  readonly segmenter: Segmenter;
  readonly init: Fmp4Init | undefined;
  readonly segments: readonly Segment[];
  readonly targetDuration: number;
  readonly ended: boolean;
};

const BEFORE_INIT: Fmp4Init = { bytes: new Uint8Array(0), videoTrackId: 0, timescale: 1 };

export const startHlsStream = (options: HlsStreamOptions): HlsStream => ({
  options,
  reader: startFmp4Reader({ maxBoxSize: options.maxBoxSize }),
  pending: new Uint8Array(0),
  segmenter: startSegmenter({ init: BEFORE_INIT, ...options }),
  init: undefined,
  segments: [],
  targetDuration: Math.ceil(options.targetSeconds),
  ended: false,
});

const withSegmenter = (stream: HlsStream, segmenter: Segmenter): HlsStream => ({
  ...stream,
  segmenter,
  segments: segmenter.segments,
  targetDuration: targetDurationFor({
    previous: stream.targetDuration,
    segments: segmenter.segments,
  }),
});

const apply = (
  stream: Result<HlsStream, HlsStreamRefusal>,
  event: Fmp4Event,
): Result<HlsStream, HlsStreamRefusal> => {
  if (!stream.ok) {
    return stream;
  }
  if (event.kind === "fragment") {
    return ok(withSegmenter(stream.value, appendFragment(stream.value.segmenter, event.fragment)));
  }
  if (stream.value.init !== undefined) {
    return err("init_changed");
  }
  const { init } = event;
  return ok(
    withSegmenter({ ...stream.value, init }, startSegmenter({ init, ...stream.value.options })),
  );
};

export const feedHlsStream = (
  stream: HlsStream,
  chunk: Uint8Array,
): Result<HlsStream, HlsStreamRefusal> => {
  const input = concatBytes(stream.pending, chunk);
  const step = readFmp4({ reader: stream.reader, input });
  if (!step.ok) {
    return step;
  }
  const read = {
    ...stream,
    reader: step.value.reader,
    pending: input.slice(step.value.consumed),
  };
  return step.value.events.reduce(apply, ok(read));
};

export const endHlsStream = (stream: HlsStream): HlsStream => {
  return withSegmenter({ ...stream, ended: true }, closeSegmenter(stream.segmenter));
};
