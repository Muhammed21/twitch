import { Body, Controller, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { createZodDto, ZodResponse } from "nestjs-zod";
import { z } from "zod";

import { responses } from "@repo/contracts";
import type { Result } from "@repo/result";

import { responseDto } from "../../../openapi/response-dto.ts";
import { BodyAccountId } from "../../../platform/account-id.ts";
import { type AdminActor, adminCallerGuard, CurrentActor } from "../../../platform/admin-caller.ts";
import { pathChannelIdOf } from "../../../platform/channel-id.ts";
import { ProblemException } from "../../../platform/problem.ts";
import type { Ban as BanOutcome, BanError, BanRequest } from "../application/ban-user.ts";
import { MAX_BAN_MINUTES, MAX_BAN_REASON_LENGTH } from "../domain/ban.ts";

export const BAN_USER = Symbol("BAN_USER");

export const USER_BAN_SCOPE = "admin:user.ban";

export type BanUser = (request: BanRequest) => Promise<Result<BanOutcome, BanError>>;

class Ban extends responseDto(responses.Ban) {}

class BanUserRequest extends createZodDto(
  z.strictObject({
    userId: BodyAccountId,
    durationMinutes: z.int().optional(),
    reason: z.string(),
  }),
) {}

type BanView = z.input<typeof responses.Ban>;

const PROBLEMS: Readonly<Record<BanError, () => ProblemException>> = {
  forbidden: () => new ProblemException({ status: 403, title: "Action non autorisée" }),
  invalid_duration: () =>
    new ProblemException({
      status: 422,
      title: "Durée invalide",
      detail: `Un bannissement dure de 1 à ${MAX_BAN_MINUTES} minutes, ou il est définitif.`,
    }),
  invalid_reason: () =>
    new ProblemException({
      status: 422,
      title: "Motif invalide",
      detail: `Un motif compte de 1 à ${MAX_BAN_REASON_LENGTH} caractères.`,
    }),
};

@Controller("admin/channels")
@UseGuards(adminCallerGuard(USER_BAN_SCOPE))
export class AdminBansController {
  constructor(@Inject(BAN_USER) private readonly banUser: BanUser) {}

  @Post(":id/bans")
  @ZodResponse({ status: 201, type: Ban })
  async create(
    @Param("id") id: string,
    @Body() body: BanUserRequest,
    @CurrentActor() actor: AdminActor,
  ): Promise<BanView> {
    const channelId = pathChannelIdOf(id);
    if (channelId === undefined) {
      throw new ProblemException({ status: 404, title: "Chaîne introuvable" });
    }
    const banned = await this.banUser({
      actor,
      channelId,
      targetId: body.userId,
      durationMinutes: body.durationMinutes ?? null,
      reason: body.reason,
    });
    if (!banned.ok) {
      throw PROBLEMS[banned.error]();
    }
    const { userId, expiresAt, reason } = banned.value;
    return {
      channelId: banned.value.channelId,
      userId,
      reason,
      ...(expiresAt === null ? {} : { expiresAt: expiresAt.toISOString() }),
    };
  }
}
