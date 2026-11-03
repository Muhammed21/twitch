import { Body, Controller, HttpCode, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import type { AccessTokenIdentity } from "@repo/auth-verifier";
import { Uuid } from "@repo/contracts";

import { CurrentIdentity, OptionalAccessTokenGuard } from "../../../platform/authentication.ts";
import { InvalidRequestException } from "../../../platform/problem.ts";

export const RECORD_PRESENCE = Symbol("RECORD_PRESENCE");

export type RecordPresence = (heartbeat: { channelId: string; viewerId: string }) => Promise<void>;

const AnonymousHeartbeat = z.object({ viewerId: Uuid });

class PresenceParams extends createZodDto(z.object({ channelId: Uuid })) {}

class PresenceRequest extends createZodDto(z.object({ viewerId: Uuid.optional() })) {}

@Controller("channels")
export class PresenceController {
  constructor(@Inject(RECORD_PRESENCE) private readonly recordPresence: RecordPresence) {}

  @Post(":channelId/presence")
  @HttpCode(204)
  @UseGuards(OptionalAccessTokenGuard)
  async record(
    @Param() { channelId }: PresenceParams,
    @Body() body: PresenceRequest,
    @CurrentIdentity() identity: AccessTokenIdentity | undefined,
  ): Promise<void> {
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
