import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { muxMessages } from "./chunk-mux.ts";
import { demuxChunks, type RtmpMessage, startDemuxer } from "./chunk-stream.ts";

const LIMITS = { maxChunkSize: 65_536, maxMessageSize: 8192, maxChunkStreams: 16 };

const message: fc.Arbitrary<RtmpMessage> = fc.record({
  chunkStreamId: fc.integer({ min: 2, max: 63 }),
  typeId: fc.integer({ min: 2, max: 255 }),
  streamId: fc.nat({ max: 0xff_ff_ff_ff }),
  timestamp: fc.nat({ max: 0xff_ff_fe }),
  payload: fc.uint8Array({ minLength: 1, maxLength: 1000 }),
});

describe("multiplexage des messages RTMP envoyés au client", () => {
  it("produit des chunks que le démultiplexeur relit en messages identiques", () => {
    fc.assert(
      fc.property(fc.array(message, { maxLength: 4 }), (messages) => {
        const step = demuxChunks({ demuxer: startDemuxer(LIMITS), input: muxMessages(messages) });

        expect(step.ok ? step.value.messages : []).toEqual(messages);
      }),
    );
  });

  it("découpe un message en chunks de 128 octets, la taille de départ", () => {
    const chunks = muxMessages([
      { chunkStreamId: 3, typeId: 20, streamId: 0, timestamp: 0, payload: new Uint8Array(300) },
    ]);

    expect(chunks).toHaveLength(12 + 128 + 1 + 128 + 1 + 44);
    expect([chunks[12 + 128], chunks[12 + 128 + 1 + 128]]).toEqual([0xc3, 0xc3]);
  });
});
