import type { RtmpMessage } from "./chunk-stream.ts";

const CHUNK_SIZE = 128;
const MESSAGE_HEADER_SIZE = 12;

const muxMessage = ({ chunkStreamId, typeId, streamId, timestamp, payload }: RtmpMessage) => {
  const header = Buffer.alloc(MESSAGE_HEADER_SIZE);
  header.writeUInt8(chunkStreamId, 0);
  header.writeUIntBE(timestamp, 1, 3);
  header.writeUIntBE(payload.length, 4, 3);
  header.writeUInt8(typeId, 7);
  header.writeUInt32LE(streamId, 8);
  const pieces = Array.from({ length: Math.ceil(payload.length / CHUNK_SIZE) }, (_, index) =>
    payload.subarray(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE),
  );
  return pieces.flatMap((piece, index) => [
    index === 0 ? header : Buffer.of(0xc0 | chunkStreamId),
    piece,
  ]);
};

export const muxMessages = (messages: readonly RtmpMessage[]): Uint8Array =>
  new Uint8Array(Buffer.concat(messages.flatMap(muxMessage)));
