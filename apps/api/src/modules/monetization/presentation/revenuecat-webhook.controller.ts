import { Controller, HttpCode, Inject, Post, Req } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import type { Request } from "express";

import type { Result } from "@repo/result";

import { ProblemException } from "../../../platform/problem.ts";
import type { WebhookError, WebhookOutcome } from "../application/receive-revenuecat-webhook.ts";

export const RECEIVE_REVENUECAT_WEBHOOK = Symbol("RECEIVE_REVENUECAT_WEBHOOK");

export type ReceiveRevenueCatWebhook = (request: {
  authorization: string | undefined;
  body: Buffer;
}) => Promise<Result<WebhookOutcome, WebhookError>>;

const PROBLEMS: Readonly<Record<WebhookError, () => ProblemException>> = {
  unauthorized: () => new ProblemException({ status: 401, title: "Authorization invalide" }),
  malformed: () => new ProblemException({ status: 400, title: "Webhook invalide" }),
  not_configured: () =>
    new ProblemException({ status: 503, title: "Webhook RevenueCat non configuré" }),
};

const rawBodyOf = (request: Request): Buffer => {
  const body: unknown = request.body;
  return Buffer.isBuffer(body) ? body : Buffer.alloc(0);
};

@ApiExcludeController()
@Controller("webhooks/revenuecat")
export class RevenueCatWebhookController {
  constructor(
    @Inject(RECEIVE_REVENUECAT_WEBHOOK) private readonly receive: ReceiveRevenueCatWebhook,
  ) {}

  @Post()
  @HttpCode(200)
  async handle(@Req() request: Request): Promise<void> {
    const outcome = await this.receive({
      authorization: request.header("authorization"),
      body: rawBodyOf(request),
    });
    if (!outcome.ok) {
      throw PROBLEMS[outcome.error]();
    }
  }
}
