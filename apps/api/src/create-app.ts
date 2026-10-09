import { ConsoleLogger, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { toNodeHandler } from "better-auth/node";
import type { Express } from "express";

import { assertSchemaVersion, createContextClient, LATEST_MIGRATION } from "@repo/db";

import { AppModule } from "./app.module.ts";
import { createIdentityAuth } from "./modules/identity/identity.module.ts";
import { type AppConfig, loadEnv } from "./platform/config/env.ts";
import { configureApp } from "./platform/configure-app.ts";
import { type LogSink, stdoutSink } from "./platform/logging.ts";

export const createApp = async ({
  env,
  logSink = stdoutSink,
}: {
  env: Readonly<Record<string, string | undefined>>;
  logSink?: LogSink;
}): Promise<{ app: INestApplication; config: AppConfig }> => {
  const config = loadEnv(env);
  const prisma = createContextClient({ context: "identity", env });
  const auth = createIdentityAuth({
    prisma,
    secret: config.authSecret,
    baseURL: config.authBaseUrl,
  });
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.register({
      schemaVersionCheck: () =>
        assertSchemaVersion({
          connectionString: config.databaseUrlHealth,
          migration: LATEST_MIGRATION,
        }),
      logSink,
      identity: { prisma },
    }),
    { logger: new ConsoleLogger({ json: true }), bodyParser: false },
  );
  configureApp(app);
  const server: Express = app.getHttpAdapter().getInstance();
  server.all("/auth/{*splat}", toNodeHandler(auth));
  app.useBodyParser("json");
  return { app, config };
};
