import { Body, Controller, HttpCode, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import type { AccessTokenIdentity } from "@repo/auth-verifier";
import { Uuid } from "@repo/contracts";

import { CurrentIdentity, OptionalAccessTokenGuard } from "../../../platform/authentication.ts";
import { PathChannelId } from "../../../platform/channel-id.ts";
import { CLIENT_IP_OF, type ClientIpOf } from "../../../platform/client-ip.ts";
import { InvalidRequestException } from "../../../platform/problem.ts";
import { tooManyRequests } from "../../../platform/rate-limit.ts";
import { PRESENCE_RATE_LIMIT, type PresenceRateLimit } from "./presence-rate-limit.ts";

export const RECORD_PRESENCE = Symbol("RECORD_PRESENCE");

export type RecordPresence = (heartbeat: { channelId: string; viewerId: string }) => Promise<void>;

const AnonymousHeartbeat = z.object({ viewerId: Uuid });

class PresenceParams extends createZodDto(z.object({ channelId: PathChannelId })) {}

class PresenceRequest extends createZodDto(z.object({ viewerId: Uuid.optional() })) {}

@Controller("channels")
export class PresenceController {
  constructor(
    @Inject(RECORD_PRESENCE) private readonly recordPresence: RecordPresence,
    @Inject(PRESENCE_RATE_LIMIT) private readonly rateLimit: PresenceRateLimit,
    @Inject(CLIENT_IP_OF) private readonly clientIpOf: ClientIpOf,
  ) {}

  @Post(":channelId/presence")
  @HttpCode(204)
  @UseGuards(OptionalAccessTokenGuard)
  async record(
    @Param() { channelId }: PresenceParams,
    @Body() body: PresenceRequest,
    @CurrentIdentity() identity: AccessTokenIdentity | undefined,
    @Req() request: Request,
  ): Promise<void> {
    const decision = await this.rateLimit({ ip: this.clientIpOf(request), channelId });
    if (!decision.allowed) {
      throw tooManyRequests(decision.retryAfterSeconds);
    }
    if (identity !== undefined) {
      await this.recordPresence({ channelId, viewerId: identity.userId });
      return;
    }
    const anonymous = AnonymousHeartbeat.safeParse(body);
    if (!anonymous.success) {
      throw new InvalidRequestException(anonymous.error);
    }
    await this.recordPresence({ channelId, viewerId: anonymous.data.viewerId });
  }
}
