import { describe, expect, it } from "vitest";

import { demuxChunks, startDemuxer } from "../rtmp/chunk-stream.ts";
import {
  FFMPEG_PUBLISH_CHUNKS,
  FFMPEG_PUBLISH_FLV_TAGS,
  flvTagsOf,
} from "../rtmp/testing/rtmp-fixtures.ts";
import { FLV_HEADER, flvTag, isMedia } from "./flv-mux.ts";

const LIMITS = { maxChunkSize: 65_536, maxMessageSize: 1024 * 1024, maxChunkStreams: 16 };

const publishedMessages = () => {
  const step = demuxChunks({ demuxer: startDemuxer(LIMITS), input: FFMPEG_PUBLISH_CHUNKS });
  return step.ok ? step.value.messages : [];
};

describe("mux FLV des messages audio et vidéo RTMP", () => {
  it("ouvre le flux par un en-tête FLV audio et vidéo, suivi d'une taille de tag nulle", () => {
    expect([...FLV_HEADER]).toEqual([0x46, 0x4c, 0x56, 1, 0x05, 0, 0, 0, 9, 0, 0, 0, 0]);
  });

  it("rend les tags que ffmpeg écrit pour la même publication", () => {
    const media = publishedMessages().filter(isMedia);

    const flv = Buffer.concat([FLV_HEADER, ...media.map(flvTag)]);

    expect(flvTagsOf(flv)).toEqual(
      FFMPEG_PUBLISH_FLV_TAGS.filter(({ typeId }) => typeId === 8 || typeId === 9),
    );
  });

  it("écrit l'octet haut d'un horodatage de plus de 24 bits dans l'extension du tag", () => {
    const tag = flvTag({
      chunkStreamId: 4,
      typeId: 9,
      streamId: 1,
      timestamp: 0x12_34_56_78,
      payload: Uint8Array.of(1, 2, 3),
    });

    expect([...tag.subarray(4, 8)]).toEqual([0x34, 0x56, 0x78, 0x12]);
    expect([...tag.subarray(tag.length - 4)]).toEqual([0, 0, 0, 14]);
  });

  it("ne garde que l'audio et la vidéo", () => {
    expect(
      [8, 9, 18, 20].map((typeId) =>
        isMedia({
          chunkStreamId: 4,
          typeId,
          streamId: 1,
          timestamp: 0,
          payload: new Uint8Array(1),
        }),
      ),
    ).toEqual([true, true, false, false]);
  });
});
