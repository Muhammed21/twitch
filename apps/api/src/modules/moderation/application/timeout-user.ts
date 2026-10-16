import { type AuthzContext, channelMember } from "@repo/authorization";
import { err, ok, type Result } from "@repo/result";

import { parseTimeoutDuration, timeoutEnd } from "../domain/timeout.ts";

export type TimeoutRecord = {
  readonly timeoutId: string;
  readonly outboxEventId: string;
  readonly channelId: string;
  readonly targetId: string;
  readonly actorId: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
};

export interface TimeoutLedger {
  record(timeout: TimeoutRecord): Promise<void>;
}

export interface SanctionedAssignmentsCache {
  invalidate(userId: string): Promise<void>;
}

export type TimeoutRequest = {
  readonly actorId: string;
  readonly channelId: string;
  readonly targetId: string;
  readonly durationSeconds: number;
};

export type Timeout = {
  readonly channelId: string;
  readonly userId: string;
  readonly expiresAt: Date;
  readonly cacheInvalidated: boolean;
};

export type TimeoutError = "forbidden" | "invalid_duration";

const invalidated = (cache: SanctionedAssignmentsCache, userId: string): Promise<boolean> =>
  cache.invalidate(userId).then(
    () => true,
    () => false,
  );

export const timeoutUser =
  ({
    authz,
    ledger,
    cache,
    newId,
    now,
  }: {
    authz: AuthzContext;
    ledger: TimeoutLedger;
    cache: SanctionedAssignmentsCache;
    newId: () => string;
    now: () => Date;
  }) =>
  async ({
    actorId,
    channelId,
    targetId,
    durationSeconds,
  }: TimeoutRequest): Promise<Result<Timeout, TimeoutError>> => {
    const issuedAt = now();
    const target = channelMember({
      channelId,
      targetAssignments: await authz.assignmentsOf(targetId),
      now: issuedAt,
    });
    if ((await authz.abilityFor(actorId)).cannot("timeout", target)) {
      return err("forbidden");
    }
    const duration = parseTimeoutDuration(durationSeconds);
    if (!duration.ok) {
      return duration;
    }
    const expiresAt = timeoutEnd({ issuedAt, duration: duration.value });
    await ledger.record({
      timeoutId: newId(),
      outboxEventId: newId(),
      channelId,
      targetId,
      actorId,
      issuedAt,
      expiresAt,
    });
    return ok({
      channelId,
      userId: targetId,
      expiresAt,
      cacheInvalidated: await invalidated(cache, targetId),
    });
  };
