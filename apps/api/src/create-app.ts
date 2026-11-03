import { ConsoleLogger, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { Express } from "express";

import { assertSchemaVersion, createContextClient, LATEST_MIGRATION } from "@repo/db";

import { AppModule } from "./app.module.ts";
import { createAuthzRedis } from "./authz/authz-context.ts";
import {
  createIdentityAccessTokenVerifier,
  createIdentityAuth,
  createIdentityRedis,
  mountAuthPages,
  mountIdentityRoutes,
} from "./modules/identity/identity.module.ts";
import { createSmtpMailer } from "./modules/identity/infrastructure/smtp-mailer.ts";
import { createPresenceRedis } from "./modules/stream/stream.module.ts";
import { type AppConfig, loadEnv } from "./platform/config/env.ts";
import { configureApp } from "./platform/configure-app.ts";
import { errorDetails, type LogSink, stdoutSink, writeLog } from "./platform/logging.ts";
import { useRawWebhookBodies } from "./platform/raw-webhook-body.ts";
import { createStreamConsumerRedis } from "./platform/stream-consumer.ts";

export const createApp = async ({
  env,
  logSink = stdoutSink,
}: {
  env: Readonly<Record<string, string | undefined>>;
  logSink?: LogSink;
}): Promise<{ app: INestApplication; config: AppConfig }> => {
  const config = loadEnv(env);
  const prisma = createContextClient({ context: "identity", env });
  const redis = createIdentityRedis(config.redisUrl).on("error", (error: unknown) => {
    writeLog(logSink, { level: "error", msg: "redis", ...errorDetails(error) });
  });
  redis.connect().catch(() => {});
  const authzRedis = createAuthzRedis(config.redisUrl).on("error", (error: unknown) => {
    writeLog(logSink, { level: "error", msg: "redis authz", ...errorDetails(error) });
  });
  authzRedis.connect().catch(() => {});
  const consumerRedis = createStreamConsumerRedis(config.redisUrl).on("error", (error: unknown) => {
    writeLog(logSink, { level: "error", msg: "redis stream consumer", ...errorDetails(error) });
  });
  consumerRedis.connect().catch(() => {});
  const streamConsumerRedis = createStreamConsumerRedis(config.redisUrl).on(
    "error",
    (error: unknown) => {
      writeLog(logSink, { level: "error", msg: "redis stream consumer", ...errorDetails(error) });
    },
  );
  streamConsumerRedis.connect().catch(() => {});
  const presenceRedis = createPresenceRedis(config.redisUrl).on("error", (error: unknown) => {
    writeLog(logSink, { level: "error", msg: "redis présence", ...errorDetails(error) });
  });
  presenceRedis.connect().catch(() => {});
  const connectedConsumerRedis = () => {
    const client = createStreamConsumerRedis(config.redisUrl).on("error", (error: unknown) => {
      writeLog(logSink, { level: "error", msg: "redis stream consumer", ...errorDetails(error) });
    });
    client.connect().catch(() => {});
    return client;
  };
  const auth = createIdentityAuth({
    prisma,
    redis,
    secret: config.authSecret,
    baseURL: config.authBaseUrl,
    mailer: createSmtpMailer(config.smtp),
  });
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.register({
      schemaVersionCheck: () =>
        assertSchemaVersion({
          connectionString: config.databaseUrlHealth,
          migration: LATEST_MIGRATION,
        }),
      logSink,
      accessTokenVerifier: createIdentityAccessTokenVerifier({
        auth,
        redis,
        baseURL: config.authBaseUrl,
      }),
      identity: { prisma, redis },
      channel: {
        prisma: createContextClient({ context: "channel", env }),
        authzRedis,
        consumerRedis,
      },
      stream: {
        prisma: createContextClient({ context: "stream", env }),
        webhookSecret: config.videoWebhookSecret,
        playbackBaseUrl: config.videoPlaybackBaseUrl,
        video: config.video,
        consumerRedis: streamConsumerRedis,
        presenceRedis,
        trustedProxyCount: config.trustedProxyCount,
      },
      moderation: { prisma: createContextClient({ context: "moderation", env }) },
      discovery: {
        prisma: createContextClient({ context: "discovery", env }),
        channelConsumerRedis: connectedConsumerRedis(),
        streamConsumerRedis: connectedConsumerRedis(),
      },
      mobile: {
        featureFlags: config.featureFlags,
        minSupportedVersion: config.mobileMinSupportedVersion,
      },
    }),
    { logger: new ConsoleLogger({ json: true }), bodyParser: false },
  );
  configureApp(app);
  const server: Express = app.getHttpAdapter().getInstance();
  mountIdentityRoutes(server, auth);
  mountAuthPages(server, auth, config.authBaseUrl);
  useRawWebhookBodies(app);
  app.useBodyParser("json");
  return { app, config };
};
