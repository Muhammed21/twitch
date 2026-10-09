import { writeFile } from "node:fs/promises";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "../app.module.ts";
import { configureApp } from "../platform/configure-app.ts";
import { buildOpenApiDocument } from "./build-document.ts";

const OUTPUT = new URL("../../openapi.json", import.meta.url);

const app = configureApp(
  await NestFactory.create(
    AppModule.register({ schemaVersionCheck: async () => {}, logSink: () => {} }),
    { logger: false },
  ),
);
await app.init();
await writeFile(OUTPUT, `${JSON.stringify(buildOpenApiDocument(app), null, 2)}\n`);
await app.close();
