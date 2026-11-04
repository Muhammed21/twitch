import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";

import { describe, expect, it, onTestFinished } from "vitest";

import { createControlPlane } from "../control-plane/control-plane.ts";
import { inMemoryVideoStore } from "../control-plane/in-memory-video-store.ts";
import { makeVideoChannel } from "../control-plane/testing/video-store.contract.ts";
import { startHttpServer } from "../http/http-server.ts";
import { createPublishGate } from "../ingest/publish-gate.ts";
import { extractFrame, FFMPEG_THUMBNAIL_ARGS } from "../media/frame-extractor.ts";
import { createLivePipeline } from "../media/live-pipeline.ts";
import { FFMPEG_FMP4_ARGS, startPackaging } from "../media/packager.ts";
import { startRtmpServer } from "../rtmp/rtmp-server.ts";
import { concatBytes } from "../segmenter/bytes.ts";
import { createHlsRegistry } from "./hls-registry.ts";
import { hlsFragmentSink } from "./hls-sink.ts";
import { createThumbnails } from "./thumbnails.ts";

const RETENTION_MS = 500;

const eventually = async <T>(attempt: () => Promise<T | undefined>, timeoutMs = 20_000) => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await attempt();
    if (value !== undefined || Date.now() > deadline) {
      return value;
    }
    await sleep(100);
  }
};

const startService = async () => {
  const store = inMemoryVideoStore();
  const channel = makeVideoChannel();
  await store.saveChannel(channel);
  const registry = createHlsRegistry({
    maxBoxSize: 8 * 1024 * 1024,
    targetSeconds: 2,
    targetDuration: 6,
    partTarget: 0.334,
    capacity: 6,
    maxSegmentBytes: 32 * 1024 * 1024,
  });
  const sink = hlsFragmentSink({
    registry,
    retentionMs: RETENTION_MS,
    schedule: (run, afterMs) => {
      setTimeout(run, afterMs);
    },
    onRefused: () => undefined,
  });
  const rtmp = await startRtmpServer({
    port: 0,
    handshakeTimeoutMs: 5000,
    idleTimeoutMs: 30_000,
    limits: { maxChunkSize: 65_536, maxMessageSize: 2 * 1024 * 1024, maxChunkStreams: 16 },
    randomBytes,
    onMessage: () => undefined,
    publish: createLivePipeline({
      gate: createPublishGate({ store, newId: randomUUID, now: () => new Date() }),
      maxSessions: 4,
      startPackaging: ({ sessionId, onExit }) =>
        startPackaging({
          sessionId,
          command: { file: "ffmpeg", args: FFMPEG_FMP4_ARGS },
          maxPendingBytes: 8 * 1024 * 1024,
          killGraceMs: 2000,
          ...sink,
          onExit,
        }),
    }),
    onError: () => undefined,
  });
  onTestFinished(() => rtmp.close());
  const http = await startHttpServer({
    port: 0,
    serviceSecret: "s".repeat(32),
    controlPlane: createControlPlane({
      store,
      ingestUrl: `rtmp://127.0.0.1:${rtmp.port}/live`,
      newId: randomUUID,
      randomBytes,
    }),
    hls: {
      find: registry.find,
      waitFor: registry.waitFor,
      blockingTimeoutMs: 18_000,
      liveSessionOf: async (channelId) => (await store.liveSessionOf(channelId))?.id,
      fallbackBandwidth: 6_000_000,
      thumbnailOf: createThumbnails({
        extract: extractFrame({
          command: { file: "ffmpeg", args: FFMPEG_THUMBNAIL_ARGS },
          timeoutMs: 10_000,
          maxOutputBytes: 1024 * 1024,
        }),
        ttlMs: 30_000,
        now: Date.now,
      }).of,
    },
  });
  onTestFinished(() => http.close());
  const get = (path: string) => fetch(new URL(path, `http://127.0.0.1:${http.port}`));
  return { channel, rtmpPort: rtmp.port, httpPort: http.port, get };
};

const publishWithFfmpeg = (url: string) => {
  const publisher = spawn(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-re",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=160x90:rate=30",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=44100",
      "-t",
      "7",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-tune",
      "zerolatency",
      "-g",
      "30",
      "-keyint_min",
      "30",
      "-sc_threshold",
      "0",
      "-c:a",
      "aac",
      "-f",
      "flv",
      url,
    ],
    { stdio: "ignore" },
  );
  onTestFinished(() => {
    publisher.kill("SIGKILL");
  });
  return once(publisher, "exit");
};

const ok = async (response: Response) => (response.ok ? response : undefined);

const codecsOf = async (input: string, bytes: Uint8Array = new Uint8Array(0)) => {
  const probe = spawn(
    "ffprobe",
    ["-v", "error", "-show_entries", "stream=codec_name", "-of", "csv=p=0", "-i", input],
    { stdio: ["pipe", "pipe", "ignore"] },
  );
  const output: Buffer[] = [];
  probe.stdout.on("data", (chunk: Buffer) => output.push(chunk));
  probe.stdin.end(bytes);
  await once(probe, "close");
  const lines = Buffer.concat(output).toString().split("\n");
  return [...new Set(lines.filter((line) => line !== ""))].toSorted();
};

describe("publication ffmpeg réelle jusqu'à la lecture HLS (ADR 0031, §5 et §6)", () => {
  it(
    "sert la playlist du canal, ses segments lisibles et sa vignette, puis 404 après la fin du live",
    { timeout: 60_000 },
    async () => {
      const { channel, rtmpPort, httpPort, get } = await startService();
      const published = publishWithFfmpeg(`rtmp://127.0.0.1:${rtmpPort}/live/${channel.streamKey}`);

      const master = await eventually(async () =>
        ok(await get(`/hls/channels/${channel.id}/master.m3u8`)),
      );
      const mediaUri = (await master?.text())?.split("\n").find((line) => line.endsWith(".m3u8"));
      const media = await eventually(async () => {
        const playlist = await (await get(String(mediaUri))).text();
        return playlist.includes("#EXTINF") ? playlist : undefined;
      });
      const mediaUrl = new URL(String(mediaUri), "http://hls.invalid");
      const firstSegment = media?.split("\n").find((line) => line.endsWith(".m4s"));
      const init = await get(new URL("init.mp4", mediaUrl).pathname);
      const segment = await get(new URL(String(firstSegment), mediaUrl).pathname);

      expect(media).toContain("#EXT-X-TARGETDURATION:6\n");
      const partDurations = String(media)
        .split("\n")
        .filter((line) => line.startsWith("#EXT-X-PART:"))
        .map((line) => Number(/DURATION=([\d.]+)/.exec(line)?.[1]));
      expect(partDurations.length).toBeGreaterThan(0);
      expect(Math.max(...partDurations)).toBeLessThanOrEqual(0.5);
      expect(init.headers.get("content-type")).toBe("video/mp4");
      expect(segment.status).toBe(200);
      expect(
        await codecsOf(
          "pipe:0",
          concatBytes(
            new Uint8Array(await init.arrayBuffer()),
            new Uint8Array(await segment.arrayBuffer()),
          ),
        ),
      ).toEqual(["aac", "h264"]);

      expect(
        await codecsOf(`http://127.0.0.1:${httpPort}/hls/channels/${channel.id}/master.m3u8`),
      ).toEqual(["aac", "h264"]);

      const thumbnail = await get(`/hls/channels/${channel.id}/thumbnail.jpg`);
      expect(thumbnail.headers.get("content-type")).toBe("image/jpeg");
      expect(await codecsOf("pipe:0", new Uint8Array(await thumbnail.arrayBuffer()))).toEqual([
        "mjpeg",
      ]);

      await published;
      const ended = await eventually(async () => {
        const playlist = await (await get(String(mediaUri))).text();
        return playlist.includes("#EXT-X-ENDLIST") ? playlist : undefined;
      });
      const gone = await eventually(async () => {
        const response = await get(String(mediaUri));
        return response.status === 404 ? response : undefined;
      });

      expect(ended).toBeDefined();
      expect(gone?.status).toBe(404);
      expect((await get(`/hls/channels/${channel.id}/master.m3u8`)).status).toBe(404);
      expect((await get(`/hls/channels/${channel.id}/thumbnail.jpg`)).status).toBe(404);
    },
  );
});
