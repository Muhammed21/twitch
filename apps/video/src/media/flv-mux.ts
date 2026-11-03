import type { RtmpMessage } from "../rtmp/chunk-stream.ts";

const AUDIO = 8;
const VIDEO = 9;
const TAG_HEADER_SIZE = 11;
const PREVIOUS_TAG_SIZE = 4;

export const FLV_HEADER = Uint8Array.of(0x46, 0x4c, 0x56, 1, 0x05, 0, 0, 0, 9, 0, 0, 0, 0);

export const isMedia = ({ typeId }: RtmpMessage): boolean => typeId === AUDIO || typeId === VIDEO;

export const flvTag = ({ typeId, timestamp, payload }: RtmpMessage): Uint8Array => {
  const tag = Buffer.alloc(TAG_HEADER_SIZE + payload.length + PREVIOUS_TAG_SIZE);
  tag.writeUInt8(typeId, 0);
  tag.writeUIntBE(payload.length, 1, 3);
  tag.writeUIntBE(timestamp & 0xff_ff_ff, 4, 3);
  tag.writeUInt8(Math.floor(timestamp / 0x1_00_00_00) & 0xff, 7);
  tag.set(payload, TAG_HEADER_SIZE);
  tag.writeUInt32BE(TAG_HEADER_SIZE + payload.length, TAG_HEADER_SIZE + payload.length);
  return new Uint8Array(tag.buffer, tag.byteOffset, tag.length);
};
