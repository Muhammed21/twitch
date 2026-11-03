import { randomBytes, randomUUID } from "node:crypto";

import { describe, expect, it, onTestFinished } from "vitest";

import { inMemoryVideoStore } from "../control-plane/in-memory-video-store.ts";
import { makeVideoChannel } from "../control-plane/testing/video-store.contract.ts";
import { startRtmpServer } from "../rtmp/rtmp-server.ts";
import { replayFfmpegPublish, waitFor } from "../rtmp/testing/rtmp-client.ts";
import { FFMPEG_STREAM_KEY } from "../rtmp/testing/rtmp-fixtures.ts";
import { createPublishGate } from "./publish-gate.ts";

const startIngest = async ({ streamKey }: { streamKey: string }) => {
  const store = inMemoryVideoStore();
  const channel = { ...makeVideoChannel(), streamKey };
  await store.saveChannel(channel);
  const server = await startRtmpServer({
    port: 0,
    handshakeTimeoutMs: 1000,
    idleTimeoutMs: 1000,
    limits: { maxChunkSize: 65_536, maxMessageSize: 65_536, maxChunkStreams: 16 },
    randomBytes,
    onMessage: () => undefined,
    publish: createPublishGate({ store, newId: randomUUID, now: () => new Date() }),
    onError: () => undefined,
  });
  onTestFinished(() => server.close());
  const liveSessionsOfChannel = async () => {
    const live = await store.liveSessions();
    return live.filter(({ channelId }) => channelId === channel.id);
  };
  return { store, server, channel, liveSessionsOfChannel };
};

const typesOf = async (store: ReturnType<typeof inMemoryVideoStore>, sessionId: string) =>
  (await store.eventsOf(sessionId)).map(({ type }) => type);

describe("ingest RTMP de bout en bout, sur les octets d'une publication ffmpeg", () => {
  it("accepte la clé du canal et émet stream.started", async () => {
    const { store, server, liveSessionsOfChannel } = await startIngest({
      streamKey: FFMPEG_STREAM_KEY,
    });

    const publisher = await replayFfmpegPublish({ port: server.port, through: "publish" });
    await waitFor(async () => (await liveSessionsOfChannel()).length === 1);

    const [live] = await liveSessionsOfChannel();
    expect(await typesOf(store, live?.id ?? "")).toEqual(["stream.started"]);
    expect(await publisher.isClosed()).toBe(false);
  });

  it("ferme la connexion d'une clé invalide, sans ouvrir de session", async () => {
    const { store, server } = await startIngest({ streamKey: makeVideoChannel().streamKey });

    const publisher = await replayFfmpegPublish({ port: server.port, through: "publish" });

    expect(await publisher.closed).toBe(true);
    expect(await store.liveSessions()).toEqual([]);
    expect(server.stats().rejections.publish_refused).toBe(1);
  });

  it("refuse un second publisher sur le canal en direct", async () => {
    const { server, liveSessionsOfChannel } = await startIngest({ streamKey: FFMPEG_STREAM_KEY });
    const first = await replayFfmpegPublish({ port: server.port, through: "publish" });
    await waitFor(async () => (await liveSessionsOfChannel()).length === 1);

    const second = await replayFfmpegPublish({ port: server.port, through: "publish" });

    expect(await second.closed).toBe(true);
    expect(await first.isClosed()).toBe(false);
    expect(await liveSessionsOfChannel()).toHaveLength(1);
  });

  it("émet stream.ended quand le publisher coupe brutalement la connexion", async () => {
    const { store, server, liveSessionsOfChannel } = await startIngest({
      streamKey: FFMPEG_STREAM_KEY,
    });
    const publisher = await replayFfmpegPublish({ port: server.port, through: "publish" });
    await waitFor(async () => (await liveSessionsOfChannel()).length === 1);
    const [live] = await liveSessionsOfChannel();

    publisher.socket.resetAndDestroy();
    await waitFor(async () => (await liveSessionsOfChannel()).length === 0);

    expect(await typesOf(store, live?.id ?? "")).toEqual(["stream.started", "stream.ended"]);
  });
});
