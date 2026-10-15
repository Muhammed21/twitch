import type { IncomingMessage } from "node:http";

import type { NestExpressApplication } from "@nestjs/platform-express";

const WEBHOOK_PATH = "/v1/webhooks/";
const WEBHOOK_BODY_LIMIT = "16kb";

const isWebhook = (request: IncomingMessage): boolean =>
  String(request.url).startsWith(WEBHOOK_PATH);

export const useRawWebhookBodies = (app: NestExpressApplication): NestExpressApplication =>
  app.useBodyParser("raw", { type: isWebhook, limit: WEBHOOK_BODY_LIMIT });
