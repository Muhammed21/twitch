import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { ZodResponse } from "nestjs-zod";

import type { AccessTokenIdentity } from "@repo/auth-verifier";
import { responses } from "@repo/contracts";
import type { Result } from "@repo/result";

import { responseDto } from "../../../openapi/response-dto.ts";
import {
  AccessTokenGuard,
  CurrentIdentity,
  invalidToken,
} from "../../../platform/authentication.ts";
import type { Account } from "../application/get-current-account.ts";

export const GET_CURRENT_ACCOUNT = Symbol("GET_CURRENT_ACCOUNT");

export type GetCurrentAccount = (userId: string) => Promise<Result<Account, "account_not_found">>;

class Me extends responseDto(responses.Me) {}

@Controller("me")
@UseGuards(AccessTokenGuard)
export class MeController {
  constructor(@Inject(GET_CURRENT_ACCOUNT) private readonly currentAccount: GetCurrentAccount) {}

  @Get()
  @ZodResponse({ status: 200, type: Me })
  async read(@CurrentIdentity() identity: AccessTokenIdentity): Promise<Account> {
    const account = await this.currentAccount(identity.userId);
    if (!account.ok) {
      throw invalidToken();
    }
    return account.value;
  }
}
