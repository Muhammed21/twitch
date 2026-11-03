import { once } from "node:events";

import { createClient } from "redis";

import { createAccessTokenVerifier } from "@repo/auth-verifier";

import { createMessageSender } from "./application/message-sender.ts";
import { createRoomRegistry } from "./application/room-registry.ts";
import { loadEnv } from "./config/env.ts";
import { redisConnectionLog } from "./infrastructure/redis-connection-log.ts";
import { redisChatterProfiles, redisRoomDirectory } from "./infrastructure/redis-local-views.ts";
import { redisRevokedSessions } from "./infrastructure/redis-revoked-sessions.ts";
import { type ChatLog, startChatServer } from "./transport/chat-server.ts";

const BUCKET_SWEEP_INTERVAL_MS = 10_000;

const log: ChatLog = (entry) => {
  process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), ...entry })}\n`);
};

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

try {
  const config = loadEnv(process.env);
  const redis = createClient({ url: config.redisUrl, name: "chat", disableOfflineQueue: true });
  const connection = redisConnectionLog(log);
  redis.on("error", connection.onError);
  redis.on("ready", connection.onReady);
  redis.connect().catch(() => {});
  const messages = createMessageSender();
  const server = await startChatServer({
    port: config.httpPort,
    verifier: createAccessTokenVerifier({
      ...config.accessTokens,
      revokedSessions: redisRevokedSessions(redis),
    }),
    log,
    chatters: redisChatterProfiles(redis),
    rooms: createRoomRegistry(redisRoomDirectory(redis)),
    messages,
  }).catch((error: unknown) => {
    redis.destroy();
    throw error;
  });
  const sweep = setInterval(() => messages.sweep(new Date()), BUCKET_SWEEP_INTERVAL_MS);
  log({ level: "info", msg: "chat démarré", port: server.port });

  await Promise.race([once(process, "SIGTERM"), once(process, "SIGINT")]);
  clearInterval(sweep);
  await server.close();
  redis.destroy();
  log({ level: "info", msg: "chat arrêté" });
} catch (error) {
  process.stderr.write(`${messageOf(error)}\n`);
  process.exitCode = 1;
}
