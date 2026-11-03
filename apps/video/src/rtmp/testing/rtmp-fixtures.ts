import { readFileSync } from "node:fs";

import { demuxChunks, type RtmpMessage, startDemuxer } from "../chunk-stream.ts";

const HANDSHAKE_BYTES = 1 + 2 * 1536;
const FLV_HEADER_SIZE = 9;
const FLV_TAG_HEADER_SIZE = 11;
const PREVIOUS_TAG_SIZE = 4;

const fixture = (name: string): Buffer => readFileSync(new URL(`./${name}`, import.meta.url));

export const FFMPEG_PUBLISH = new Uint8Array(fixture("ffmpeg-publish.bin"));

export const FFMPEG_PUBLISH_CHUNKS = FFMPEG_PUBLISH.subarray(HANDSHAKE_BYTES);

export const FFMPEG_STREAM_KEY = "sk_live_test";

const COMMAND = 20;
const FIXTURE_LIMITS = { maxChunkSize: 65_536, maxMessageSize: 1024 * 1024, maxChunkStreams: 16 };

const messagesOf = (chunks: Uint8Array): readonly RtmpMessage[] => {
  const step = demuxChunks({ demuxer: startDemuxer(FIXTURE_LIMITS), input: chunks });
  return step.ok ? step.value.messages : [];
};

const FFMPEG_MESSAGES = messagesOf(FFMPEG_PUBLISH_CHUNKS);

const namesCommand = (name: string) => (message: RtmpMessage) =>
  message.typeId === COMMAND &&
  Buffer.from(message.payload.subarray(3, 3 + name.length)).toString("latin1") === name &&
  message.payload[2] === name.length;

export const ffmpegMessage = (name: string): RtmpMessage => {
  const message = FFMPEG_MESSAGES.find(namesCommand(name));
  if (message === undefined) {
    throw new Error(`commande ${name} absente de la fixture`);
  }
  return message;
};

const shortestPrefixWith = (count: number, low: number, high: number): number => {
  if (low === high) {
    return low;
  }
  const middle = Math.floor((low + high) / 2);
  return messagesOf(FFMPEG_PUBLISH_CHUNKS.subarray(0, middle)).length >= count
    ? shortestPrefixWith(count, low, middle)
    : shortestPrefixWith(count, middle + 1, high);
};

export const ffmpegPublishThrough = (name: string): Uint8Array => {
  const count = FFMPEG_MESSAGES.findIndex(namesCommand(name)) + 1;
  return FFMPEG_PUBLISH.subarray(
    0,
    HANDSHAKE_BYTES + shortestPrefixWith(count, 0, FFMPEG_PUBLISH_CHUNKS.length),
  );
};

export type FlvTag = {
  readonly typeId: number;
  readonly timestamp: number;
  readonly payload: Uint8Array;
};

const tagsFrom = (flv: Buffer, offset: number): readonly FlvTag[] => {
  if (offset + FLV_TAG_HEADER_SIZE > flv.length) {
    return [];
  }
  const size = flv.readUIntBE(offset + 1, 3);
  const timestamp = flv.readUIntBE(offset + 4, 3) + flv.readUInt8(offset + 7) * 2 ** 24;
  const start = offset + FLV_TAG_HEADER_SIZE;
  return [
    {
      typeId: flv.readUInt8(offset),
      timestamp,
      payload: new Uint8Array(flv.subarray(start, start + size)),
    },
    ...tagsFrom(flv, start + size + PREVIOUS_TAG_SIZE),
  ];
};

export const FFMPEG_PUBLISH_FLV_TAGS: readonly FlvTag[] = tagsFrom(
  fixture("ffmpeg-publish.flv"),
  FLV_HEADER_SIZE + PREVIOUS_TAG_SIZE,
);

export const makeChunk = ({
  fmt,
  chunkStreamId,
  timestamp = 0,
  length = 0,
  typeId = 0,
  streamId = 0,
  data = new Uint8Array(0),
}: {
  fmt: 0 | 1 | 2 | 3;
  chunkStreamId: number;
  timestamp?: number;
  length?: number;
  typeId?: number;
  streamId?: number;
  data?: Uint8Array;
}): Uint8Array => {
  const basic =
    chunkStreamId < 64
      ? [(fmt << 6) | chunkStreamId]
      : chunkStreamId < 320
        ? [fmt << 6, chunkStreamId - 64]
        : [(fmt << 6) | 1, (chunkStreamId - 64) % 256, Math.floor((chunkStreamId - 64) / 256)];
  const extended = timestamp >= 0xffffff;
  const field = extended ? 0xffffff : timestamp;
  const header = Buffer.alloc([11, 7, 3, 0][fmt] ?? 0);
  if (fmt < 3) {
    header.writeUIntBE(field, 0, 3);
  }
  if (fmt < 2) {
    header.writeUIntBE(length, 3, 3);
    header.writeUInt8(typeId, 6);
  }
  if (fmt === 0) {
    header.writeUInt32LE(streamId, 7);
  }
  const extendedBytes = Buffer.alloc(extended ? 4 : 0);
  if (extended) {
    extendedBytes.writeUInt32BE(timestamp, 0);
  }
  return new Uint8Array(Buffer.concat([Uint8Array.from(basic), header, extendedBytes, data]));
};

export const concatBytes = (...parts: readonly Uint8Array[]): Uint8Array =>
  new Uint8Array(Buffer.concat(parts));
