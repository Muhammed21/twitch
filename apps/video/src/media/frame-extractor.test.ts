import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { extractFrame, FFMPEG_THUMBNAIL_ARGS } from "./frame-extractor.ts";

const FAKE_FFMPEG = fileURLToPath(new URL("./testing/fake-ffmpeg.mjs", import.meta.url));

type FakeMode = "echo" | "deaf" | "fail" | "silent" | "noisy-exit" | "flood";

const fakeFfmpeg = (mode: FakeMode) => ({ file: process.execPath, args: [FAKE_FFMPEG, mode] });

const INPUT = Uint8Array.from([1, 2, 3, 4, 5]);

const extractWith = ({
  mode,
  timeoutMs = 5000,
  maxOutputBytes = 1024,
}: {
  mode: FakeMode;
  timeoutMs?: number;
  maxOutputBytes?: number;
}) => extractFrame({ command: fakeFfmpeg(mode), timeoutMs, maxOutputBytes });

describe("extraction d'une image par ffmpeg", () => {
  it("écrit le fMP4 sur l'entrée de ffmpeg et rend sa sortie complète", async () => {
    expect(await extractWith({ mode: "echo" })(INPUT)).toEqual(INPUT);
  });

  it("accepte une sortie exactement au plafond", async () => {
    expect(await extractWith({ mode: "echo", maxOutputBytes: INPUT.length })(INPUT)).toEqual(INPUT);
  });

  it("ne rend rien quand la sortie dépasse le plafond", async () => {
    expect(
      await extractWith({ mode: "echo", maxOutputBytes: INPUT.length - 1 })(INPUT),
    ).toBeUndefined();
  });

  it("tue ffmpeg dès que sa sortie dépasse le plafond, sans attendre le délai", async () => {
    const started = Date.now();

    expect(await extractWith({ mode: "flood", timeoutMs: 10_000 })(INPUT)).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("ignore les journaux de ffmpeg, aussi longs soient-ils", async () => {
    expect(await extractWith({ mode: "noisy-exit", timeoutMs: 2000 })(INPUT)).toEqual(
      new TextEncoder().encode("ready"),
    );
  });

  it("ne rend rien quand ffmpeg sort en erreur, même après avoir écrit", async () => {
    expect(await extractWith({ mode: "fail" })(INPUT)).toBeUndefined();
  });

  it("ne rend rien quand ffmpeg sort sans rien écrire ni lire son entrée", async () => {
    expect(await extractWith({ mode: "silent" })(new Uint8Array(4 * 1024 * 1024))).toBeUndefined();
  });

  it("tue ffmpeg et ne rend rien au bout du délai", async () => {
    const started = Date.now();

    expect(await extractWith({ mode: "deaf", timeoutMs: 100 })(INPUT)).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("ne rend rien quand ffmpeg ne se lance pas", async () => {
    const extract = extractFrame({
      command: { file: "/nonexistent/ffmpeg", args: [] },
      timeoutMs: 1000,
      maxOutputBytes: 1024,
    });

    expect(await extract(INPUT)).toBeUndefined();
  });

  it("demande une seule image JPEG de 360 lignes, lue en MP4 sur l'entrée standard", () => {
    expect(FFMPEG_THUMBNAIL_ARGS).toEqual([
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "mp4",
      "-i",
      "pipe:0",
      "-frames:v",
      "1",
      "-vf",
      "scale=-2:360",
      "-q:v",
      "5",
      "-f",
      "image2",
      "-c:v",
      "mjpeg",
      "pipe:1",
    ]);
  });
});
