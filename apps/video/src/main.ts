import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";

import { Pool } from "pg";

import { createContextClient } from "@repo/db";

import { loadEnv } from "./config/env.ts";
import { createControlPlane } from "./control-plane/control-plane.ts";
import { startHttpServer } from "./http/http-server.ts";
import { startRelayLoop } from "./outbox/relay-loop.ts";
import { relayVideoOutbox } from "./outbox/video-outbox-relay.ts";
import { prismaVideoStore } from "./persistence/prisma-video-store.ts";
import { streamKeyCipher } from "./persistence/stream-key-cipher.ts";
import { startRtmpServer } from "./rtmp/rtmp-server.ts";

const RTMP_HANDSHAKE_TIMEOUT_MS = 5000;
const RTMP_IDLE_TIMEOUT_MS = 30_000;
const RTMP_LIMITS = { maxChunkSize: 65_536, maxMessageSize: 2 * 1024 * 1024, maxChunkStreams: 16 };

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
  const rtmp = await startRtmpServer({
    port: config.rtmpPort,
    handshakeTimeoutMs: RTMP_HANDSHAKE_TIMEOUT_MS,
    idleTimeoutMs: RTMP_IDLE_TIMEOUT_MS,
    limits: RTMP_LIMITS,
    randomBytes,
    onMessage: () => undefined,
    publish: async () => undefined,
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
      store: prismaVideoStore({
        prisma,
        cipher: streamKeyCipher({ key: config.streamKeyEncryptionKey }),
      }),
      ingestUrl: config.ingestUrl,
      newId: randomUUID,
      randomBytes,
    }),
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
