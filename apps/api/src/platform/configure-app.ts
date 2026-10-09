import type { INestApplication } from "@nestjs/common";

import { LOG_SINK, type LogSink } from "./logging.ts";
import { requestContext } from "./request-context.ts";

export const configureApp = (app: INestApplication): INestApplication =>
  app
    .use(requestContext(app.get<LogSink>(LOG_SINK)))
    .setGlobalPrefix("v1", { exclude: ["health/live", "health/ready"] });
