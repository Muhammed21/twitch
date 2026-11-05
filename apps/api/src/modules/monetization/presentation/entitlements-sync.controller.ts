import { Controller, HttpCode, Inject, Post, UseGuards } from "@nestjs/common";
import { ZodResponse } from "nestjs-zod";
import type { z } from "zod";

import type { AccessTokenIdentity } from "@repo/auth-verifier";
import { responses } from "@repo/contracts";

import { responseDto } from "../../../openapi/response-dto.ts";
import { AccessTokenGuard, CurrentIdentity } from "../../../platform/authentication.ts";
import { ProblemException } from "../../../platform/problem.ts";
import { type RateDecision, tooManyRequests } from "../../../platform/rate-limit.ts";
import type {
  ReadActiveEntitlements,
  SyncTurboEntitlement,
} from "../application/sync-turbo-entitlement.ts";

export const SYNC_TURBO_ENTITLEMENT = Symbol("SYNC_TURBO_ENTITLEMENT");
export const READ_ACTIVE_ENTITLEMENTS = Symbol("READ_ACTIVE_ENTITLEMENTS");
export const ENTITLEMENTS_SYNC_RATE_LIMIT = Symbol("ENTITLEMENTS_SYNC_RATE_LIMIT");

export type EntitlementsSyncRateLimit = (userId: string) => Promise<RateDecision>;

class EntitlementList extends responseDto(responses.EntitlementList) {}

@Controller("me/entitlements")
@UseGuards(AccessTokenGuard)
export class EntitlementsSyncController {
  constructor(
    @Inject(SYNC_TURBO_ENTITLEMENT) private readonly sync: SyncTurboEntitlement | undefined,
    @Inject(READ_ACTIVE_ENTITLEMENTS) private readonly readEntitlements: ReadActiveEntitlements,
    @Inject(ENTITLEMENTS_SYNC_RATE_LIMIT) private readonly rateLimit: EntitlementsSyncRateLimit,
  ) {}

  @Post("sync")
  @HttpCode(200)
  @ZodResponse({ status: 200, type: EntitlementList })
  async resync(
    @CurrentIdentity() identity: AccessTokenIdentity,
  ): Promise<z.input<typeof responses.EntitlementList>> {
    if (this.sync === undefined) {
      throw new ProblemException({
        status: 503,
        title: "Resynchronisation RevenueCat non configurée",
      });
    }
    const decision = await this.rateLimit(identity.userId);
    if (!decision.allowed) {
      throw tooManyRequests(decision.retryAfterSeconds);
    }
    const synced = await this.sync(identity.userId);
    if (!synced.ok) {
      throw new ProblemException({ status: 503, title: "RevenueCat injoignable" });
    }
    const entitlements = await this.readEntitlements(identity.userId);
    return {
      entitlements: entitlements.map(({ scope, expiresAt }) => ({
        scope,
        expiresAt: expiresAt.toISOString(),
      })),
    };
  }
}
