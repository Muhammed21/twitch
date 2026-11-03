import { once } from "node:events";

import { createClient } from "redis";

import { createAccessTokenVerifier } from "@repo/auth-verifier";

import { loadEnv } from "./config/env.ts";
import { redisRevokedSessions } from "./infrastructure/redis-revoked-sessions.ts";
import { type ChatLog, startChatServer } from "./transport/chat-server.ts";

const log: ChatLog = (entry) => {
  process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), ...entry })}\n`);
};

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

try {
  const config = loadEnv(process.env);
  const redis = createClient({ url: config.redisUrl, name: "chat", disableOfflineQueue: true });
  redis.on("error", (error: unknown) => {
    log({ level: "error", msg: "redis injoignable", error: messageOf(error) });
  });
  redis.connect().catch(() => {});
  const server = await startChatServer({
    port: config.httpPort,
    verifier: createAccessTokenVerifier({
      ...config.accessTokens,
      revokedSessions: redisRevokedSessions(redis),
    }),
    log,
  });
  log({ level: "info", msg: "chat démarré", port: server.port });

  await Promise.race([once(process, "SIGTERM"), once(process, "SIGINT")]);
  await server.close();
  redis.destroy();
  log({ level: "info", msg: "chat arrêté" });
} catch (error) {
  process.stderr.write(`${messageOf(error)}\n`);
  process.exitCode = 1;
}
