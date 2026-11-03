import { spawn } from "node:child_process";

import type { RtmpMessage } from "../rtmp/chunk-stream.ts";
import { FLV_HEADER, flvTag, isMedia } from "./flv-mux.ts";

export const FFMPEG_FMP4_ARGS: readonly string[] = [
  "-hide_banner",
  "-loglevel",
  "error",
  "-analyzeduration",
  "500000",
  "-f",
  "flv",
  "-i",
  "pipe:0",
  "-c",
  "copy",
  "-f",
  "mp4",
  "-movflags",
  "frag_keyframe+empty_moov+default_base_moof",
  "-frag_duration",
  "330000",
  "pipe:1",
];

export type PackagerCommand = { readonly file: string; readonly args: readonly string[] };

export type FragmentSink = {
  readonly onFragmentBytes: (sessionId: string, chunk: Uint8Array) => void;
  readonly onFragmentsEnd: (sessionId: string) => void;
};

export type Packaging = {
  readonly pid: number | undefined;
  readonly write: (message: RtmpMessage) => void;
  readonly stop: () => Promise<void>;
};

export const startPackaging = ({
  sessionId,
  command,
  maxPendingBytes,
  killGraceMs,
  onFragmentBytes,
  onFragmentsEnd,
  onExit,
}: FragmentSink & {
  sessionId: string;
  command: PackagerCommand;
  maxPendingBytes: number;
  killGraceMs: number;
  onExit: (sessionId: string) => void;
}): Packaging => {
  const child = spawn(command.file, command.args, { stdio: ["pipe", "pipe", "ignore"] });
  const state = { stopping: false };
  const closed = new Promise<void>((resolve) => {
    child.once("close", () => resolve());
  });
  child.on("error", () => undefined);
  child.stdin.on("error", () => undefined);
  child.stdout.on("data", (chunk: Buffer) => onFragmentBytes(sessionId, new Uint8Array(chunk)));
  void closed.then(() => {
    onFragmentsEnd(sessionId);
    if (!state.stopping) {
      onExit(sessionId);
    }
  });
  child.stdin.write(FLV_HEADER);

  return {
    pid: child.pid,
    write: (message) => {
      if (!isMedia(message) || !child.stdin.writable) {
        return;
      }
      if (child.stdin.writableLength > maxPendingBytes) {
        child.kill("SIGKILL");
        return;
      }
      child.stdin.write(flvTag(message));
    },
    stop: async () => {
      state.stopping = true;
      child.kill("SIGTERM");
      const forced = setTimeout(() => child.kill("SIGKILL"), killGraceMs);
      await closed;
      clearTimeout(forced);
    },
  };
};
