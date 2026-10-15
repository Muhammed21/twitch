import { Controller, HttpCode, Inject, Post, Req } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import type { Request } from "express";

import type { Result } from "@repo/result";

import { ProblemException } from "../../../platform/problem.ts";
import type { RawWebhook, WebhookError } from "../application/live-video-provider.ts";
import type { LifecycleOutcome } from "../application/record-stream-lifecycle.ts";

export const RECEIVE_PROVIDER_WEBHOOK = Symbol("RECEIVE_PROVIDER_WEBHOOK");

export type ReceiveProviderWebhook = (
  webhook: Omit<RawWebhook, "receivedAt">,
) => Promise<Result<LifecycleOutcome, WebhookError>>;

const PROBLEMS: Readonly<Record<WebhookError, () => ProblemException>> = {
  invalid_signature: () => new ProblemException({ status: 401, title: "Signature invalide" }),
  malformed_payload: () => new ProblemException({ status: 400, title: "Webhook invalide" }),
};

const rawBodyOf = (request: Request): Buffer => {
  const body: unknown = request.body;
  return Buffer.isBuffer(body) ? body : Buffer.alloc(0);
};

@ApiExcludeController()
@Controller("webhooks/video")
export class VideoWebhookController {
  constructor(@Inject(RECEIVE_PROVIDER_WEBHOOK) private readonly receive: ReceiveProviderWebhook) {}

  @Post()
  @HttpCode(204)
  async handle(@Req() request: Request): Promise<void> {
    const outcome = await this.receive({
      body: rawBodyOf(request),
      signature: request.header("x-video-signature"),
    });
    if (!outcome.ok) {
      throw PROBLEMS[outcome.error]();
    }
    if (outcome.value.status === "not-yet-started") {
      throw new ProblemException({ status: 409, title: "Session pas encore démarrée" });
    }
  }
}
