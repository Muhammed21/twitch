import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { ZodResponse } from "nestjs-zod";

import type { AccessTokenIdentity } from "@repo/auth-verifier";
import { responses } from "@repo/contracts";

import { responseDto } from "../../../openapi/response-dto.ts";
import {
  AccessTokenGuard,
  CurrentIdentity,
  invalidToken,
} from "../../../platform/authentication.ts";
import type { MeView, ReadMe } from "../application/read-me.ts";

export const READ_ME = Symbol("READ_ME");

class Me extends responseDto(responses.Me) {}

@Controller("me")
@UseGuards(AccessTokenGuard)
export class MeController {
  constructor(@Inject(READ_ME) private readonly readMe: ReadMe) {}

  @Get()
  @ZodResponse({ status: 200, type: Me })
  async read(@CurrentIdentity() identity: AccessTokenIdentity): Promise<MeView> {
    const account = await this.readMe(identity.userId);
    if (!account.ok) {
      throw invalidToken();
    }
    return account.value;
  }
}
