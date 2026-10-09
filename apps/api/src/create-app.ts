import { ConsoleLogger, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { assertSchemaVersion, LATEST_MIGRATION } from "@repo/db";

import { AppModule } from "./app.module.ts";
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
  const app = await NestFactory.create(
    AppModule.register({
      schemaVersionCheck: () =>
        assertSchemaVersion({
          connectionString: config.databaseUrlHealth,
          migration: LATEST_MIGRATION,
        }),
      logSink,
    }),
    { logger: new ConsoleLogger({ json: true }) },
  );
  return { app: configureApp(app), config };
};
