import { once } from "node:events";
import { hostname } from "node:os";

import { createClient } from "redis";

import { createAccessTokenVerifier } from "@repo/auth-verifier";

import { createMessageSender } from "./application/message-sender.ts";
import { chatEventHandlers } from "./application/project-event.ts";
import { createRoomRegistry } from "./application/room-registry.ts";
import { loadEnv } from "./config/env.ts";
import { createConsumerRedis, startEventConsumer } from "./infrastructure/event-consumer.ts";
import { redisConnectionLog } from "./infrastructure/redis-connection-log.ts";
import { redisLocalViewWriter } from "./infrastructure/redis-local-view-writer.ts";
import { redisChatterProfiles, redisRoomDirectory } from "./infrastructure/redis-local-views.ts";
import { redisRevokedSessions } from "./infrastructure/redis-revoked-sessions.ts";
import { subscribeToSessionRevocations } from "./infrastructure/session-revocation-subscriber.ts";
import { type ChatLog, startChatServer } from "./transport/chat-server.ts";

const BUCKET_SWEEP_INTERVAL_MS = 10_000;
const REVALIDATION_INTERVAL_MS = 5 * 60_000;
const EVENT_STREAMS = ["events.channel", "events.stream", "events.identity", "events.moderation"];
const CONSUMER_GROUP = "chat";
const CLAIM_IDLE_MS = 30_000;
const BLOCK_MS = 1000;

const log: ChatLog = (entry) => {
  process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), ...entry })}\n`);
};

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

try {
  const config = loadEnv(process.env);
  const redis = createClient({ url: config.redisUrl, name: "chat", disableOfflineQueue: true });
  const consumerRedis = createConsumerRedis(config.redisUrl);
  const revocationRedis = createClient({ url: config.redisUrl, name: "chat-revocations" });
  const connection = redisConnectionLog(log);
  const consumerConnection = redisConnectionLog((entry) => log({ ...entry, client: "events" }));
  redis.on("error", connection.onError);
  redis.on("ready", connection.onReady);
  consumerRedis.on("error", consumerConnection.onError);
  consumerRedis.on("ready", consumerConnection.onReady);
  const revocationConnection = redisConnectionLog((entry) =>
    log({ ...entry, client: "revocations" }),
  );
  revocationRedis.on("error", revocationConnection.onError);
  revocationRedis.on("ready", revocationConnection.onReady);
  redis.connect().catch(() => {});
  consumerRedis.connect().catch(() => {});
  revocationRedis.connect().catch(() => {});
  const destroyRedis = () => {
    redis.destroy();
    consumerRedis.destroy();
    revocationRedis.destroy();
  };
  const messages = createMessageSender();
  const rooms = createRoomRegistry(redisRoomDirectory(redis));
  const server = await startChatServer({
    port: config.httpPort,
    verifier: createAccessTokenVerifier({
      ...config.accessTokens,
      revokedSessions: redisRevokedSessions(redis),
    }),
    log,
    chatters: redisChatterProfiles(redis),
    rooms,
    messages,
  }).catch((error: unknown) => {
    destroyRedis();
    throw error;
  });
  const consumer = startEventConsumer({
    redis: consumerRedis,
    streams: EVENT_STREAMS,
    group: CONSUMER_GROUP,
    consumer: `${hostname()}-${process.pid}`,
    handlers: chatEventHandlers({
      views: redisLocalViewWriter(redis),
      rooms,
      sockets: server,
      log,
    }),
    claimIdleMs: CLAIM_IDLE_MS,
    blockMs: BLOCK_MS,
    onError: ({ stream, entryId, error }) =>
      log({
        level: "error",
        msg: "consommation d'event en échec",
        stream,
        entryId,
        error: String(error),
      }),
  });
  subscribeToSessionRevocations({
    subscriber: revocationRedis,
    onRevoked: server.revokeSessions,
    onMalformed: () => log({ level: "error", msg: "révocation hors contrat" }),
  }).catch((error: unknown) =>
    log({ level: "error", msg: "abonnement aux révocations en échec", error: messageOf(error) }),
  );
  const sweep = setInterval(() => messages.sweep(new Date()), BUCKET_SWEEP_INTERVAL_MS);
  const revalidation = setInterval(() => {
    server
      .revalidateSessions()
      .catch((error: unknown) =>
        log({ level: "error", msg: "revalidation en échec", error: messageOf(error) }),
      );
  }, REVALIDATION_INTERVAL_MS);
  log({ level: "info", msg: "chat démarré", port: server.port });

  await Promise.race([once(process, "SIGTERM"), once(process, "SIGINT")]);
  clearInterval(sweep);
  clearInterval(revalidation);
  await consumer.stop();
  await server.close();
  destroyRedis();
  log({ level: "info", msg: "chat arrêté" });
} catch (error) {
  process.stderr.write(`${messageOf(error)}\n`);
  process.exitCode = 1;
}
