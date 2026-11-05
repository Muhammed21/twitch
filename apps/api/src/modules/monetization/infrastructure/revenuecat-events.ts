import { z } from "zod";

import { err, ok, type Result } from "@repo/result";

import type { TurboCommand } from "../application/apply-turbo-command.ts";

export const TURBO_ENTITLEMENT = "turbo";

export type SkipReason = "malformed" | "unhandled_type" | "other_entitlement" | "unknown_user";

const Timestamp = z.int().nonnegative();

const Event = z.looseObject({
  type: z.string(),
  event_timestamp_ms: Timestamp,
  app_user_id: z.string().optional(),
  entitlement_ids: z.array(z.string()).nullish(),
  expiration_at_ms: Timestamp.nullish(),
  grace_period_expiration_at_ms: Timestamp.nullish(),
  original_transaction_id: z.string().nullish(),
  cancel_reason: z.string().nullish(),
  transferred_from: z.array(z.string()).optional(),
  transferred_to: z.array(z.string()).optional(),
});

const Payload = z.looseObject({ event: Event });

type RevenueCatEvent = z.infer<typeof Event>;

const isAccountId = (value: string): boolean => z.uuid().safeParse(value).success;

const SIMPLE_KINDS = {
  EXPIRATION: "expired",
  SUBSCRIPTION_PAUSED: "paused",
  REFUND: "refunded",
} as const;

const SUBSCRIBED_KINDS = { INITIAL_PURCHASE: "purchased", RENEWAL: "renewed" } as const;

const isKey = <T extends object>(table: T, key: string): key is Extract<keyof T, string> =>
  Object.hasOwn(table, key);

const transfer = (event: RevenueCatEvent): Result<TurboCommand, SkipReason> => {
  if (event.transferred_to === undefined) {
    return err("malformed");
  }
  const toUserId = event.transferred_to.find(isAccountId);
  return toUserId === undefined
    ? err("unknown_user")
    : ok({
        kind: "transfer",
        fromUserIds: event.transferred_from?.filter(isAccountId) ?? [],
        toUserId,
        occurredAt: new Date(event.event_timestamp_ms),
      });
};

const turboEvent = (
  event: RevenueCatEvent,
  base: { userId: string; occurredAt: Date },
): Result<TurboCommand, SkipReason> => {
  const { type } = event;
  if (isKey(SUBSCRIBED_KINDS, type)) {
    return event.expiration_at_ms === undefined || event.expiration_at_ms === null
      ? err("malformed")
      : ok({
          kind: "apply",
          event: {
            ...base,
            kind: SUBSCRIBED_KINDS[type],
            expiresAt: new Date(event.expiration_at_ms),
            providerReference: event.original_transaction_id ?? undefined,
          },
        });
  }
  if (isKey(SIMPLE_KINDS, type)) {
    return ok({ kind: "apply", event: { ...base, kind: SIMPLE_KINDS[type] } });
  }
  if (type === "CANCELLATION") {
    const kind = event.cancel_reason === "CUSTOMER_SUPPORT" ? "refunded" : "renewal_cancelled";
    return ok({ kind: "apply", event: { ...base, kind } });
  }
  if (type === "BILLING_ISSUE") {
    const graceEndsAt = event.grace_period_expiration_at_ms;
    return ok({
      kind: "apply",
      event: {
        ...base,
        kind: "billing_issue",
        graceEndsAt:
          graceEndsAt === undefined || graceEndsAt === null ? undefined : new Date(graceEndsAt),
      },
    });
  }
  return err("unhandled_type");
};

export const translateRevenueCatEvent = (payload: unknown): Result<TurboCommand, SkipReason> => {
  const parsed = Payload.safeParse(payload);
  if (!parsed.success) {
    return err("malformed");
  }
  const { event } = parsed.data;
  if (event.type === "TRANSFER") {
    return transfer(event);
  }
  if (event.app_user_id === undefined) {
    return err("malformed");
  }
  if (event.entitlement_ids?.includes(TURBO_ENTITLEMENT) !== true) {
    return err("other_entitlement");
  }
  if (!isAccountId(event.app_user_id)) {
    return err("unknown_user");
  }
  return turboEvent(event, {
    userId: event.app_user_id,
    occurredAt: new Date(event.event_timestamp_ms),
  });
};
