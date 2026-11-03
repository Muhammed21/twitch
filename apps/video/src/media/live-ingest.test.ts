import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { describe, expect, it, onTestFinished } from "vitest";

import { inMemoryVideoStore } from "../control-plane/in-memory-video-store.ts";
import { makeVideoChannel } from "../control-plane/testing/video-store.contract.ts";
import { createPublishGate } from "../ingest/publish-gate.ts";
import { startRtmpServer } from "../rtmp/rtmp-server.ts";
import { publishWith, replayFfmpegPublish, waitFor } from "../rtmp/testing/rtmp-client.ts";
import { FFMPEG_STREAM_KEY } from "../rtmp/testing/rtmp-fixtures.ts";
import { FLV_HEADER } from "./flv-mux.ts";
import { createLivePipeline } from "./live-pipeline.ts";
import { startPackaging } from "./packager.ts";

const FAKE_FFMPEG = fileURLToPath(new URL("./testing/fake-ffmpeg.mjs", import.meta.url));

const isAlive = (pid: number | undefined) => {
  try {
    return pid !== undefined && process.kill(pid, 0);
  } catch {
    return false;
  }
};

const startLiveIngest = async ({
  maxSessions = 4,
  streamKeys = [FFMPEG_STREAM_KEY],
}: { maxSessions?: number; streamKeys?: readonly string[] } = {}) => {
  const store = inMemoryVideoStore();
  const channels = streamKeys.map((streamKey) => ({ ...makeVideoChannel(), streamKey }));
  await Promise.all(channels.map((channel) => store.saveChannel(channel)));
  const pids: Array<number | undefined> = [];
  const output = new Map<string, Buffer>();
  const server = await startRtmpServer({
    port: 0,
    handshakeTimeoutMs: 2000,
    idleTimeoutMs: 2000,
    limits: { maxChunkSize: 65_536, maxMessageSize: 65_536, maxChunkStreams: 16 },
    randomBytes,
    onMessage: () => undefined,
    publish: createLivePipeline({
      gate: createPublishGate({ store, newId: randomUUID, now: () => new Date() }),
      maxSessions,
      startPackaging: ({ sessionId, onExit }) => {
        const packaging = startPackaging({
          sessionId,
          command: { file: process.execPath, args: [FAKE_FFMPEG, "echo"] },
          maxPendingBytes: 1024 * 1024,
          killGraceMs: 2000,
          onFragmentBytes: (id, chunk) => {
            output.set(id, Buffer.concat([output.get(id) ?? Buffer.alloc(0), chunk]));
          },
          onFragmentsEnd: () => undefined,
          onExit,
        });
        pids.push(packaging.pid);
        return packaging;
      },
    }),
    onError: () => undefined,
  });
  onTestFinished(() => server.close());
  const sessionsOf = async () => {
    const live = await store.liveSessions();
    return live.map(({ id }) => id);
  };
  return { store, server, pids, output, sessionsOf };
};

describe("ingest RTMP jusqu'au ffmpeg de la session", () => {
  it("envoie la publication en FLV au ffmpeg de la session, qui rend sa sortie au nom de la session", async () => {
    const { server, output, sessionsOf } = await startLiveIngest();
    await replayFfmpegPublish({ port: server.port, through: "publish" });
    await waitFor(async () => (await sessionsOf()).length === 1);
    const [sessionId] = await sessionsOf();

    await waitFor(() => (output.get(sessionId ?? "")?.length ?? 0) > FLV_HEADER.length);

    expect(output.get(sessionId ?? "")?.subarray(0, FLV_HEADER.length)).toEqual(
      Buffer.from(FLV_HEADER),
    );
  });

  it("ne laisse aucun ffmpeg vivant quand la publication se termine", async () => {
    const { store, server, pids, sessionsOf } = await startLiveIngest();
    const publisher = await replayFfmpegPublish({ port: server.port, through: "publish" });
    await waitFor(async () => (await sessionsOf()).length === 1);
    const [sessionId] = await sessionsOf();

    publisher.socket.end();
    await waitFor(async () => (await sessionsOf()).length === 0);

    expect(pids).toHaveLength(1);
    expect(pids.map(isAlive)).toEqual([false]);
    expect((await store.eventsOf(sessionId ?? "")).map(({ type }) => type)).toEqual([
      "stream.started",
      "stream.ended",
    ]);
  });

  it("termine la session et ferme la connexion quand son ffmpeg est tué", async () => {
    const { store, server, pids, sessionsOf } = await startLiveIngest();
    const publisher = await replayFfmpegPublish({ port: server.port, through: "publish" });
    await waitFor(async () => (await sessionsOf()).length === 1);
    const [sessionId] = await sessionsOf();

    process.kill(pids[0] ?? 0, "SIGKILL");

    expect(await publisher.closed).toBe(true);
    await waitFor(async () => (await sessionsOf()).length === 0);
    expect((await store.eventsOf(sessionId ?? "")).map(({ type }) => type)).toEqual([
      "stream.started",
      "stream.ended",
    ]);
  });

  it("refuse une publication au-delà du plafond de sessions, sans lancer de ffmpeg", async () => {
    const other = makeVideoChannel().streamKey;
    const { server, pids, sessionsOf } = await startLiveIngest({
      maxSessions: 1,
      streamKeys: [FFMPEG_STREAM_KEY, other],
    });
    const first = await replayFfmpegPublish({ port: server.port, through: "publish" });
    await waitFor(async () => (await sessionsOf()).length === 1);

    const second = await publishWith(server.port, other);

    expect(await second.closed).toBe(true);
    expect(await first.isClosed()).toBe(false);
    expect(pids).toHaveLength(1);
  });
});
