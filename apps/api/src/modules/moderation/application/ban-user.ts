import { type AuthzContext, channelMember } from "@repo/authorization";
import { err, ok, type Result } from "@repo/result";

import type { AuditActor } from "../../../platform/audit-actor.ts";
import { banEnd, parseBanReason, parseBanTerm } from "../domain/ban.ts";
import type { SanctionedAssignmentsCache } from "./timeout-user.ts";

export type BanRecord = {
  readonly banId: string;
  readonly outboxEventId: string;
  readonly actor: AuditActor;
  readonly channelId: string;
  readonly targetId: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date | null;
  readonly reason: string;
};

export interface BanLedger {
  record(ban: BanRecord): Promise<void>;
}

export type BanRequest = {
  readonly actor: AuditActor;
  readonly channelId: string;
  readonly targetId: string;
  readonly durationMinutes: number | null;
  readonly reason: string;
};

export type Ban = {
  readonly channelId: string;
  readonly userId: string;
  readonly expiresAt: Date | null;
  readonly reason: string;
  readonly cacheInvalidated: boolean;
};

export type BanError = "forbidden" | "invalid_duration" | "invalid_reason";

const invalidated = (cache: SanctionedAssignmentsCache, userId: string): Promise<boolean> =>
  cache.invalidate(userId).then(
    () => true,
    () => false,
  );

export const banUser =
  ({
    authz,
    ledger,
    cache,
    newId,
    now,
  }: {
    authz: AuthzContext;
    ledger: BanLedger;
    cache: SanctionedAssignmentsCache;
    newId: () => string;
    now: () => Date;
  }) =>
  async ({
    actor,
    channelId,
    targetId,
    durationMinutes,
    reason,
  }: BanRequest): Promise<Result<Ban, BanError>> => {
    const issuedAt = now();
    const target = channelMember({
      channelId,
      targetAssignments: await authz.assignmentsOf(targetId),
      now: issuedAt,
    });
    if ((await authz.abilityFor(actor.actorId)).cannot("ban", target)) {
      return err("forbidden");
    }
    const term = parseBanTerm(durationMinutes);
    if (!term.ok) {
      return term;
    }
    const motive = parseBanReason(reason);
    if (!motive.ok) {
      return motive;
    }
    const expiresAt = banEnd({ issuedAt, term: term.value });
    await ledger.record({
      banId: newId(),
      outboxEventId: newId(),
      actor,
      channelId,
      targetId,
      issuedAt,
      expiresAt,
      reason: motive.value,
    });
    return ok({
      channelId,
      userId: targetId,
      expiresAt,
      reason: motive.value,
      cacheInvalidated: await invalidated(cache, targetId),
    });
  };
