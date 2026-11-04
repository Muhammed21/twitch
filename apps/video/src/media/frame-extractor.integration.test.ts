import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { createHlsRegistry } from "../hls/hls-registry.ts";
import { createThumbnails } from "../hls/thumbnails.ts";
import { FFMPEG_FRAGMENTED_MP4 } from "../segmenter/testing/fmp4-fixtures.ts";
import { extractFrame, FFMPEG_THUMBNAIL_ARGS } from "./frame-extractor.ts";

const HLS_OPTIONS = {
  maxBoxSize: 1 << 20,
  targetSeconds: 2,
  targetDuration: 4,
  partTarget: 0.334,
  capacity: 6,
  maxSegmentBytes: 1 << 20,
};

const probe = (input: Uint8Array) =>
  spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_name,width,height",
      "-of",
      "csv=p=0",
      "-i",
      "pipe:0",
    ],
    { input },
  )
    .stdout.toString()
    .trim();

describe("vignette par ffmpeg réel", () => {
  it("décode une image JPEG de 360 lignes depuis l'init et le dernier segment fermé", async () => {
    const registry = createHlsRegistry(HLS_OPTIONS);
    registry.open("session");
    registry.feed("session", FFMPEG_FRAGMENTED_MP4);
    const stream = registry.find("session");
    const thumbnails = createThumbnails({
      extract: extractFrame({
        command: { file: "ffmpeg", args: FFMPEG_THUMBNAIL_ARGS },
        timeoutMs: 10_000,
        maxOutputBytes: 1024 * 1024,
      }),
      ttlMs: 30_000,
      now: Date.now,
    });

    const thumbnail = stream === undefined ? undefined : await thumbnails.of("session", stream);

    expect(thumbnail?.ok).toBe(true);
    const jpeg = thumbnail?.ok === true ? thumbnail.value : new Uint8Array(0);
    expect([...jpeg.subarray(0, 2)]).toEqual([0xff, 0xd8]);
    expect(probe(jpeg)).toBe("mjpeg,640,360");
  });
});
