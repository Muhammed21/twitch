import { Body, Controller, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { createZodDto, ZodResponse } from "nestjs-zod";
import { z } from "zod";

import type { AccessTokenIdentity } from "@repo/auth-verifier";
import { responses, Uuid } from "@repo/contracts";
import type { Result } from "@repo/result";

import { responseDto } from "../../../openapi/response-dto.ts";
import { AccessTokenGuard, CurrentIdentity } from "../../../platform/authentication.ts";
import { ProblemException } from "../../../platform/problem.ts";
import type {
  Timeout as TimeoutOutcome,
  TimeoutError,
  TimeoutRequest,
} from "../application/timeout-user.ts";
import { MAX_TIMEOUT_SECONDS } from "../domain/timeout.ts";

export const TIMEOUT_USER = Symbol("TIMEOUT_USER");

export type TimeoutUser = (
  request: TimeoutRequest,
) => Promise<Result<TimeoutOutcome, TimeoutError>>;

class Timeout extends responseDto(responses.Timeout) {}

class TimeoutUserRequest extends createZodDto(
  z.strictObject({ userId: Uuid, durationSeconds: z.int() }),
) {}

type TimeoutView = z.input<typeof responses.Timeout>;

const PROBLEMS: Readonly<Record<TimeoutError, () => ProblemException>> = {
  forbidden: () => new ProblemException({ status: 403, title: "Action non autorisée" }),
  invalid_duration: () =>
    new ProblemException({
      status: 422,
      title: "Durée invalide",
      detail: `Un timeout dure de 1 à ${MAX_TIMEOUT_SECONDS} secondes.`,
    }),
};

@Controller("channels")
export class TimeoutsController {
  constructor(@Inject(TIMEOUT_USER) private readonly timeoutUser: TimeoutUser) {}

  @Post(":id/timeouts")
  @UseGuards(AccessTokenGuard)
  @ZodResponse({ status: 201, type: Timeout })
  async create(
    @Param("id") id: string,
    @Body() body: TimeoutUserRequest,
    @CurrentIdentity() identity: AccessTokenIdentity,
  ): Promise<TimeoutView> {
    if (!Uuid.safeParse(id).success) {
      throw new ProblemException({ status: 404, title: "Chaîne introuvable" });
    }
    const timedOut = await this.timeoutUser({
      actorId: identity.userId,
      channelId: id,
      targetId: body.userId,
      durationSeconds: body.durationSeconds,
    });
    if (!timedOut.ok) {
      throw PROBLEMS[timedOut.error]();
    }
    const { channelId, userId, expiresAt } = timedOut.value;
    return { channelId, userId, expiresAt: expiresAt.toISOString() };
  }
}
