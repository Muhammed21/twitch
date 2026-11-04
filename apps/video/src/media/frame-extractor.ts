import { spawn } from "node:child_process";

import { concatBytes } from "../segmenter/bytes.ts";
import type { PackagerCommand } from "./packager.ts";

export const FFMPEG_THUMBNAIL_ARGS: readonly string[] = [
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
];

export const extractFrame =
  ({
    command,
    timeoutMs,
    maxOutputBytes,
  }: {
    readonly command: PackagerCommand;
    readonly timeoutMs: number;
    readonly maxOutputBytes: number;
  }) =>
  (fmp4: Uint8Array): Promise<Uint8Array | undefined> =>
    new Promise((resolve) => {
      const child = spawn(command.file, command.args, { stdio: ["pipe", "pipe", "ignore"] });
      const output: { chunks: readonly Uint8Array[]; size: number; overflow: boolean } = {
        chunks: [],
        size: 0,
        overflow: false,
      };
      const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
      child.on("error", () => undefined);
      child.stdin.on("error", () => undefined);
      child.stdout.on("data", (chunk: Buffer) => {
        output.size += chunk.length;
        output.overflow = output.overflow || output.size > maxOutputBytes;
        if (output.overflow) {
          child.kill("SIGKILL");
          return;
        }
        output.chunks = [...output.chunks, new Uint8Array(chunk)];
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        const bytes = concatBytes(...output.chunks);
        resolve(code === 0 && !output.overflow && bytes.length > 0 ? bytes : undefined);
      });
      child.stdin.end(fmp4);
    });
