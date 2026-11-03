import { fileURLToPath } from "node:url";

import { describe, expect, it, onTestFinished } from "vitest";

import type { RtmpMessage } from "../rtmp/chunk-stream.ts";
import { waitFor } from "../rtmp/testing/rtmp-client.ts";
import { FLV_HEADER, flvTag } from "./flv-mux.ts";
import { FFMPEG_FMP4_ARGS, type PackagerCommand, startPackaging } from "./packager.ts";

const FAKE_FFMPEG = fileURLToPath(new URL("./testing/fake-ffmpeg.mjs", import.meta.url));

type FakeMode = "echo" | "deaf" | "stubborn" | "noisy";

const fakeFfmpeg = (mode: FakeMode): PackagerCommand => ({
  file: process.execPath,
  args: [FAKE_FFMPEG, mode],
});

const makeMessage = (typeId: number, size = 4): RtmpMessage => ({
  chunkStreamId: 4,
  typeId,
  streamId: 1,
  timestamp: 40,
  payload: new Uint8Array(size).fill(typeId),
});

const isAlive = (pid: number | undefined) => {
  try {
    return pid !== undefined && process.kill(pid, 0);
  } catch {
    return false;
  }
};

const start = ({
  mode = "echo",
  maxPendingBytes = 1024 * 1024,
}: { mode?: FakeMode; maxPendingBytes?: number } = {}) => {
  const fragments: string[] = [];
  const bytes: Buffer[] = [];
  const exits: string[] = [];
  const ends: string[] = [];
  const packaging = startPackaging({
    sessionId: "session-1",
    command: fakeFfmpeg(mode),
    maxPendingBytes,
    killGraceMs: 100,
    onFragmentBytes: (sessionId, chunk) => {
      fragments.push(sessionId);
      bytes.push(Buffer.from(chunk));
    },
    onFragmentsEnd: (sessionId) => ends.push(sessionId),
    onExit: (sessionId) => exits.push(sessionId),
  });
  onTestFinished(() => packaging.stop());
  return { packaging, fragments, output: () => Buffer.concat(bytes), exits, ends };
};

describe("ffmpeg supervisé par session (ADR 0031, §4)", () => {
  it("écrit l'en-tête FLV puis un tag par message audio ou vidéo, et rend sa sortie au nom de la session", async () => {
    const { packaging, fragments, output } = start();
    const messages = [makeMessage(9), makeMessage(18), makeMessage(8)];
    const expected = Buffer.concat([FLV_HEADER, flvTag(makeMessage(9)), flvTag(makeMessage(8))]);

    messages.forEach(packaging.write);
    await waitFor(() => output().length === expected.length);

    expect(output()).toEqual(expected);
    expect(new Set(fragments)).toEqual(new Set(["session-1"]));
  });

  it("tue le process à la fin de la session, sans le signaler comme une mort", async () => {
    const { packaging, exits, ends } = start();

    await packaging.stop();

    expect(isAlive(packaging.pid)).toBe(false);
    expect(exits).toEqual([]);
    expect(ends).toEqual(["session-1"]);
  });

  it("tue de force un process qui ignore la demande d'arrêt", async () => {
    const { packaging, exits, output } = start({ mode: "stubborn" });
    await waitFor(() => output().length > 0);

    await packaging.stop();

    expect(isAlive(packaging.pid)).toBe(false);
    expect(exits).toEqual([]);
  });

  it("ne bloque pas un process qui écrit beaucoup sur sa sortie d'erreur", async () => {
    const { output } = start({ mode: "noisy" });

    await waitFor(() => output().length > 0);

    expect(output().toString()).toBe("ready");
  });

  it("lance ffmpeg en copie, du FLV de l'entrée standard au fMP4 fragmenté de la sortie standard", () => {
    expect(FFMPEG_FMP4_ARGS).toEqual([
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
      "pipe:1",
    ]);
  });

  it("signale la session dont le process meurt", async () => {
    const { packaging, exits, ends } = start();

    process.kill(packaging.pid ?? 0, "SIGKILL");
    await waitFor(() => exits.length === 1);

    expect(exits).toEqual(["session-1"]);
    expect(ends).toEqual(["session-1"]);
  });

  it("tue un process qui ne lit plus son entrée au-delà du plafond en attente", async () => {
    const { packaging, exits } = start({ mode: "deaf", maxPendingBytes: 256 * 1024 });

    for (const _ of Array.from({ length: 64 })) {
      packaging.write(makeMessage(9, 64 * 1024));
    }
    await waitFor(() => exits.length === 1);

    expect(exits).toEqual(["session-1"]);
    expect(isAlive(packaging.pid)).toBe(false);
  });

  it("signale un programme introuvable comme une mort du process", async () => {
    const exits: string[] = [];
    const packaging = startPackaging({
      sessionId: "session-2",
      command: { file: "/nulle/part/ffmpeg", args: [] },
      maxPendingBytes: 1024,
      killGraceMs: 100,
      onFragmentBytes: () => undefined,
      onFragmentsEnd: () => undefined,
      onExit: (sessionId) => exits.push(sessionId),
    });

    packaging.write(makeMessage(9));
    await waitFor(() => exits.length === 1);

    expect(exits).toEqual(["session-2"]);
    await packaging.stop();
  });
});
