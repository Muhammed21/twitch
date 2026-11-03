import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";

import { Pool } from "pg";

import { createContextClient } from "@repo/db";

import { loadEnv } from "./config/env.ts";
import { createControlPlane } from "./control-plane/control-plane.ts";
import { createHlsRegistry } from "./hls/hls-registry.ts";
import { hlsFragmentSink } from "./hls/hls-sink.ts";
import { startHttpServer } from "./http/http-server.ts";
import { createPublishGate } from "./ingest/publish-gate.ts";
import { createLivePipeline } from "./media/live-pipeline.ts";
import { FFMPEG_FMP4_ARGS, startPackaging } from "./media/packager.ts";
import { startRelayLoop } from "./outbox/relay-loop.ts";
import { relayVideoOutbox } from "./outbox/video-outbox-relay.ts";
import { prismaVideoStore } from "./persistence/prisma-video-store.ts";
import { streamKeyCipher } from "./persistence/stream-key-cipher.ts";
import { startRtmpServer } from "./rtmp/rtmp-server.ts";

const RTMP_HANDSHAKE_TIMEOUT_MS = 5000;
const RTMP_IDLE_TIMEOUT_MS = 30_000;
const FFMPEG_MAX_PENDING_BYTES = 8 * 1024 * 1024;
const FFMPEG_KILL_GRACE_MS = 2000;
const RTMP_LIMITS = { maxChunkSize: 65_536, maxMessageSize: 2 * 1024 * 1024, maxChunkStreams: 16 };
const HLS_OPTIONS = {
  maxBoxSize: 8 * 1024 * 1024,
  targetSeconds: 2,
  targetDuration: 6,
  partTarget: 0.334,
  capacity: 6,
  maxSegmentBytes: 32 * 1024 * 1024,
};
const HLS_FALLBACK_BANDWIDTH = 6_000_000;
const HLS_BLOCKING_TIMEOUT_MS = 3 * HLS_OPTIONS.targetDuration * 1000;
const HLS_ENDED_RETENTION_MS = 30_000;

const log = (
  msg: string,
  fields: Readonly<Record<string, unknown>> = {},
  level: "info" | "error" = "info",
): void => {
  process.stdout.write(
    `${JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields })}\n`,
  );
};

const logRelayFailure = (error: unknown): void => {
  log(
    "relais de l'outbox vidéo en échec",
    { error: error instanceof Error ? error.message : String(error) },
    "error",
  );
};

try {
  const config = loadEnv(process.env);
  const prisma = createContextClient({ context: "video", env: process.env });
  const store = prismaVideoStore({
    prisma,
    cipher: streamKeyCipher({ key: config.streamKeyEncryptionKey }),
  });
  const hls = createHlsRegistry(HLS_OPTIONS);
  const fragmentSink = hlsFragmentSink({
    registry: hls,
    retentionMs: HLS_ENDED_RETENTION_MS,
    schedule: (run, afterMs) => {
      setTimeout(run, afterMs).unref();
    },
    onRefused: (sessionId, reason) => {
      log("sortie de ffmpeg refusée par le segmenteur", { sessionId, reason }, "error");
    },
  });
  const rtmp = await startRtmpServer({
    port: config.rtmpPort,
    handshakeTimeoutMs: RTMP_HANDSHAKE_TIMEOUT_MS,
    idleTimeoutMs: RTMP_IDLE_TIMEOUT_MS,
    limits: RTMP_LIMITS,
    randomBytes,
    onMessage: () => undefined,
    publish: createLivePipeline({
      gate: createPublishGate({ store, newId: randomUUID, now: () => new Date() }),
      maxSessions: config.media.maxSessions,
      startPackaging: ({ sessionId, onExit }) =>
        startPackaging({
          sessionId,
          command: { file: config.media.ffmpegPath, args: FFMPEG_FMP4_ARGS },
          maxPendingBytes: FFMPEG_MAX_PENDING_BYTES,
          killGraceMs: FFMPEG_KILL_GRACE_MS,
          ...fragmentSink,
          onExit: () => {
            log("ffmpeg de la session arrêté de lui-même", { sessionId }, "error");
            onExit();
          },
        }),
    }),
    onError: (error) => {
      log(
        "publication RTMP en échec",
        { error: error instanceof Error ? error.message : String(error) },
        "error",
      );
    },
  });
  const server = await startHttpServer({
    port: config.httpPort,
    serviceSecret: config.serviceSecret,
    controlPlane: createControlPlane({
      store,
      ingestUrl: config.ingestUrl,
      newId: randomUUID,
      randomBytes,
    }),
    hls: {
      find: hls.find,
      liveSessionOf: async (channelId) => (await store.liveSessionOf(channelId))?.id,
      waitFor: hls.waitFor,
      blockingTimeoutMs: HLS_BLOCKING_TIMEOUT_MS,
      fallbackBandwidth: HLS_FALLBACK_BANDWIDTH,
    },
  }).catch(async (error: unknown) => {
    await rtmp.close();
    throw error;
  });
  const relayPool = new Pool({ connectionString: config.outboxRelay.databaseUrl });
  relayPool.on("error", logRelayFailure);
  const relay = startRelayLoop({
    intervalMs: config.outboxRelay.intervalMs,
    relay: relayVideoOutbox({
      pool: relayPool,
      webhook: config.webhook,
      now: () => new Date(),
      random: Math.random,
    }),
    onError: logRelayFailure,
  });
  log("service vidéo démarré", { httpPort: server.port, rtmpPort: rtmp.port });

  await Promise.race([once(process, "SIGTERM"), once(process, "SIGINT")]);
  server.startDraining();
  await rtmp.close();
  await server.close();
  await relay.stop();
  await relayPool.end();
  await prisma.$disconnect();
  log("service vidéo arrêté");
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
