import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { ZodResponse } from "nestjs-zod";
import type { z } from "zod";

import type { AccessTokenIdentity } from "@repo/auth-verifier";
import { responses } from "@repo/contracts";
import type { Result } from "@repo/result";

import { responseDto } from "../../../openapi/response-dto.ts";
import {
  CurrentIdentity,
  invalidToken,
  OptionalAccessTokenGuard,
} from "../../../platform/authentication.ts";
import type { Bootstrap, Entitlement, Profile } from "../application/read-bootstrap.ts";

export const READ_BOOTSTRAP = Symbol("READ_BOOTSTRAP");

export type ReadBootstrap = (
  userId: string | undefined,
) => Promise<Result<Bootstrap, "account_not_found">>;

class MobileBootstrap extends responseDto(responses.MobileBootstrap) {}

type BootstrapResponse = z.input<typeof responses.MobileBootstrap>;

const toProfileResponse = ({
  lastLiveAt,
  ...profile
}: Profile): NonNullable<BootstrapResponse["profile"]> =>
  lastLiveAt === undefined ? profile : { ...profile, lastLiveAt: lastLiveAt.toISOString() };

const toEntitlementResponse = ({ scope, expiresAt }: Entitlement) => ({
  scope,
  expiresAt: expiresAt.toISOString(),
});

const toBootstrapResponse = ({
  profile,
  entitlements,
  ...bootstrap
}: Bootstrap): BootstrapResponse => {
  const response = { ...bootstrap, entitlements: entitlements.map(toEntitlementResponse) };
  return profile === undefined ? response : { ...response, profile: toProfileResponse(profile) };
};

@Controller("mobile")
@UseGuards(OptionalAccessTokenGuard)
export class MobileBootstrapController {
  constructor(@Inject(READ_BOOTSTRAP) private readonly readBootstrap: ReadBootstrap) {}

  @Get("bootstrap")
  @ZodResponse({ status: 200, type: MobileBootstrap })
  async read(
    @CurrentIdentity() identity: AccessTokenIdentity | undefined,
  ): Promise<BootstrapResponse> {
    const bootstrap = await this.readBootstrap(identity?.userId);
    if (!bootstrap.ok) {
      throw invalidToken();
    }
    return toBootstrapResponse(bootstrap.value);
  }
}
