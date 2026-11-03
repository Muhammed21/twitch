import { err, ok, type Result } from "@repo/result";

const MIN_CHUNK_SIZE = 128;
const SET_CHUNK_SIZE = 1;
const EXTENDED_TIMESTAMP = 0xff_ff_ff;

export type ChunkLimits = {
  readonly maxChunkSize: number;
  readonly maxMessageSize: number;
  readonly maxChunkStreams: number;
};

export type RtmpMessage = {
  readonly chunkStreamId: number;
  readonly typeId: number;
  readonly streamId: number;
  readonly timestamp: number;
  readonly payload: Uint8Array;
};

export type ChunkRefusal =
  | "unknown_chunk_stream"
  | "message_too_large"
  | "invalid_chunk_size"
  | "too_many_chunk_streams";

type ChunkStream = {
  readonly timestamp: number;
  readonly delta: number;
  readonly length: number;
  readonly typeId: number;
  readonly streamId: number;
  readonly extended: boolean;
  readonly payload: Uint8Array;
  readonly received: number;
};

export type Demuxer = {
  readonly limits: ChunkLimits;
  readonly chunkSize: number;
  readonly streams: ReadonlyMap<number, ChunkStream>;
};

type ChunkRead = {
  readonly demuxer: Demuxer;
  readonly next: number;
  readonly message: RtmpMessage | undefined;
};

export const startDemuxer = (limits: ChunkLimits): Demuxer => ({
  limits,
  chunkSize: MIN_CHUNK_SIZE,
  streams: new Map(),
});

const messageHeaderSize = (fmt: number): number =>
  fmt === 0 ? 11 : fmt === 1 ? 7 : fmt === 2 ? 3 : 0;

const uint24 = (view: DataView, offset: number): number =>
  view.getUint16(offset) * 256 + view.getUint8(offset + 2);

const basicHeader = (view: DataView, offset: number) => {
  const first = view.getUint8(offset);
  const low = first & 0x3f;
  const size = low === 0 ? 2 : low === 1 ? 3 : 1;
  if (offset + size > view.byteLength) {
    return undefined;
  }
  const chunkStreamId =
    low === 0
      ? 64 + view.getUint8(offset + 1)
      : low === 1
        ? 64 + view.getUint8(offset + 1) + view.getUint8(offset + 2) * 256
        : low;
  return { fmt: first >> 6, chunkStreamId, size };
};

const EMPTY_STREAM: ChunkStream = {
  timestamp: 0,
  delta: 0,
  length: 0,
  typeId: 0,
  streamId: 0,
  extended: false,
  payload: new Uint8Array(0),
  received: 0,
};

const startedMessage = ({
  fmt,
  view,
  at,
  previous,
  extended,
  field,
}: {
  fmt: number;
  view: DataView;
  at: number;
  previous: ChunkStream;
  extended: boolean;
  field: number;
}): ChunkStream => ({
  timestamp: fmt === 0 ? field : previous.timestamp + (fmt === 3 ? previous.delta : field),
  delta: fmt === 3 ? previous.delta : field,
  length: fmt < 2 ? uint24(view, at + 3) : previous.length,
  typeId: fmt < 2 ? view.getUint8(at + 6) : previous.typeId,
  streamId: fmt === 0 ? view.getUint32(at + 7, true) : previous.streamId,
  extended,
  payload: new Uint8Array(0),
  received: 0,
});

const withRoomFor = ({ payload, received, length }: ChunkStream, size: number): Uint8Array => {
  if (received + size <= payload.length) {
    return payload;
  }
  const grown = new Uint8Array(Math.min(length, Math.max(received + size, payload.length * 2)));
  grown.set(payload.subarray(0, received));
  return grown;
};

const chunkSizeAfter = (demuxer: Demuxer, message: RtmpMessage | undefined) => {
  if (message?.typeId !== SET_CHUNK_SIZE) {
    return ok(demuxer.chunkSize);
  }
  const padded = new Uint8Array(4);
  padded.set(message.payload.subarray(0, 4));
  const value = new DataView(padded.buffer).getUint32(0) & 0x7f_ff_ff_ff;
  return value < MIN_CHUNK_SIZE || value > demuxer.limits.maxChunkSize
    ? err<ChunkRefusal>("invalid_chunk_size")
    : ok(value);
};

const readChunk = (
  demuxer: Demuxer,
  input: Uint8Array,
  offset: number,
): Result<ChunkRead | undefined, ChunkRefusal> => {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const basic = offset < input.length ? basicHeader(view, offset) : undefined;
  if (basic === undefined) {
    return ok(undefined);
  }
  const { fmt, chunkStreamId } = basic;
  const at = offset + basic.size;
  const headerEnd = at + messageHeaderSize(fmt);
  const known = demuxer.streams.get(chunkStreamId);
  if (headerEnd > input.length) {
    return ok(undefined);
  }
  if (fmt !== 0 && known === undefined) {
    return err("unknown_chunk_stream");
  }
  if (known === undefined && demuxer.streams.size >= demuxer.limits.maxChunkStreams) {
    return err("too_many_chunk_streams");
  }
  const previous = known ?? EMPTY_STREAM;
  const field = fmt < 3 ? uint24(view, at) : 0;
  const extended = fmt < 3 ? field === EXTENDED_TIMESTAMP : previous.extended;
  const dataStart = headerEnd + (extended ? 4 : 0);
  if (dataStart > input.length) {
    return ok(undefined);
  }
  const timestamp = extended ? view.getUint32(headerEnd) : field;
  const started =
    fmt === 3 && previous.received > 0
      ? previous
      : startedMessage({ fmt, view, at, previous, extended, field: timestamp });
  if (started.length > demuxer.limits.maxMessageSize) {
    return err("message_too_large");
  }
  const size = Math.min(demuxer.chunkSize, started.length - started.received);
  if (dataStart + size > input.length) {
    return ok(undefined);
  }
  const stream = { ...started, payload: withRoomFor(started, size) };
  stream.payload.set(input.subarray(dataStart, dataStart + size), stream.received);
  const received = stream.received + size;
  const message =
    received === stream.length
      ? {
          chunkStreamId,
          typeId: stream.typeId,
          streamId: stream.streamId,
          timestamp: stream.timestamp,
          payload: stream.payload,
        }
      : undefined;
  const chunkSize = chunkSizeAfter(demuxer, message);
  if (!chunkSize.ok) {
    return chunkSize;
  }
  const streams = new Map(demuxer.streams).set(
    chunkStreamId,
    message === undefined
      ? { ...stream, received }
      : { ...stream, payload: new Uint8Array(0), received: 0 },
  );
  return ok({
    demuxer: { ...demuxer, chunkSize: chunkSize.value, streams },
    next: dataStart + size,
    message,
  });
};

export const demuxChunks = ({
  demuxer,
  input,
}: {
  demuxer: Demuxer;
  input: Uint8Array;
}): Result<
  {
    readonly demuxer: Demuxer;
    readonly consumed: number;
    readonly messages: readonly RtmpMessage[];
  },
  ChunkRefusal
> => {
  const messages: RtmpMessage[] = [];
  let state = { demuxer, consumed: 0 };
  for (;;) {
    const read = readChunk(state.demuxer, input, state.consumed);
    if (!read.ok) {
      return read;
    }
    if (read.value === undefined) {
      return ok({ ...state, messages });
    }
    if (read.value.message !== undefined) {
      messages.push(read.value.message);
    }
    state = { demuxer: read.value.demuxer, consumed: read.value.next };
  }
};
