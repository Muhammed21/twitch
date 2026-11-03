import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { demuxChunks, startDemuxer } from "../rtmp/chunk-stream.ts";
import { waitFor } from "../rtmp/testing/rtmp-client.ts";
import { FFMPEG_PUBLISH_CHUNKS } from "../rtmp/testing/rtmp-fixtures.ts";
import { FLV_HEADER, flvTag, isMedia } from "./flv-mux.ts";
import { FFMPEG_FMP4_ARGS, startPackaging } from "./packager.ts";

const LIMITS = { maxChunkSize: 65_536, maxMessageSize: 1024 * 1024, maxChunkStreams: 16 };

const publishedMedia = () => {
  const step = demuxChunks({ demuxer: startDemuxer(LIMITS), input: FFMPEG_PUBLISH_CHUNKS });
  return (step.ok ? step.value.messages : []).filter(isMedia);
};

const probe = (input: Uint8Array) =>
  spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "stream=codec_name", "-of", "csv=p=0", "-i", "pipe:0"],
    { input },
  );

const boxTypesOf = (mp4: Buffer, at = 0): readonly string[] =>
  at + 8 > mp4.length
    ? []
    : [mp4.toString("latin1", at + 4, at + 8), ...boxTypesOf(mp4, at + mp4.readUInt32BE(at))];

const isAlive = (pid: number | undefined) => {
  try {
    return pid !== undefined && process.kill(pid, 0);
  } catch {
    return false;
  }
};

describe("ffmpeg réel (ADR 0031, §4)", () => {
  it("accepte le FLV produit par le mux maison : une piste H.264 et une piste AAC", () => {
    const flv = Buffer.concat([FLV_HEADER, ...publishedMedia().map(flvTag)]);

    const probed = probe(flv);

    expect(probed.status).toBe(0);
    expect(probed.stdout.toString().trim().split("\n").toSorted()).toEqual(["aac", "h264"]);
  });

  it("rend en -c copy un fMP4 fragmenté lisible par ffprobe, et ne laisse aucun ffmpeg vivant", async () => {
    const output: Buffer[] = [];
    const ends: string[] = [];
    const packaging = startPackaging({
      sessionId: "session-reelle",
      command: { file: "ffmpeg", args: FFMPEG_FMP4_ARGS },
      maxPendingBytes: 8 * 1024 * 1024,
      killGraceMs: 2000,
      onFragmentBytes: (_, chunk) => output.push(Buffer.from(chunk)),
      onFragmentsEnd: (sessionId) => ends.push(sessionId),
      onExit: () => undefined,
    });

    const media = publishedMedia();
    const span = (media.at(-1)?.timestamp ?? 0) + 100;
    [0, 1, 2]
      .flatMap((repeat) =>
        media.map((message) => ({ ...message, timestamp: message.timestamp + repeat * span })),
      )
      .forEach(packaging.write);
    await waitFor(() => boxTypesOf(Buffer.concat(output)).includes("moof"));
    await packaging.stop();
    const mp4 = Buffer.concat(output);

    expect(boxTypesOf(mp4).slice(0, 2)).toEqual(["ftyp", "moov"]);
    expect(boxTypesOf(mp4)).toContain("mdat");
    expect(probe(mp4).stdout.toString().trim().split("\n").toSorted()).toEqual(["aac", "h264"]);
    expect(isAlive(packaging.pid)).toBe(false);
    expect(ends).toEqual(["session-reelle"]);
  });
});
