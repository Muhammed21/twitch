import { writeFile } from "node:fs/promises";

import { NestFactory } from "@nestjs/core";

import { createContextClient } from "@repo/db";

import { AppModule } from "../app.module.ts";
import { createAuthzRedis } from "../authz/authz-context.ts";
import { createIdentityRedis } from "../modules/identity/identity.module.ts";
import { rejectingVerifier } from "../platform/authentication.ts";
import { configureApp } from "../platform/configure-app.ts";
import { createStreamConsumerRedis } from "../platform/stream-consumer.ts";
import { buildOpenApiDocument } from "./build-document.ts";

const OUTPUT = new URL("../../openapi.json", import.meta.url);

const prisma = createContextClient({
  context: "identity",
  env: { DATABASE_URL_IDENTITY: "postgresql://openapi@localhost/aucune-connexion" },
});

const app = configureApp(
  await NestFactory.create(
    AppModule.register({
      schemaVersionCheck: async () => {},
      logSink: () => {},
      accessTokenVerifier: rejectingVerifier,
      identity: { prisma, redis: createIdentityRedis() },
      channel: {
        prisma: createContextClient({
          context: "channel",
          env: { DATABASE_URL_CHANNEL: "postgresql://openapi@localhost/aucune-connexion" },
        }),
        authzRedis: createAuthzRedis(),
        consumerRedis: createStreamConsumerRedis(),
      },
      stream: {
        prisma: createContextClient({
          context: "stream",
          env: { DATABASE_URL_STREAM: "postgresql://openapi@localhost/aucune-connexion" },
        }),
        webhookSecret: "openapi-aucun-webhook-recu-par-ce-document",
      },
    }),
    { logger: false },
  ),
);
await app.init();
await writeFile(OUTPUT, `${JSON.stringify(buildOpenApiDocument(app), null, 2)}\n`);
await app.close();
