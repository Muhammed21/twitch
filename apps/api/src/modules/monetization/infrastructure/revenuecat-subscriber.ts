import { z } from "zod";

import { err, ok, type Result } from "@repo/result";

import type { ObservedSubscription, TurboEvent } from "../domain/turbo-entitlement.ts";
import { TURBO_ENTITLEMENT } from "./revenuecat-events.ts";

const DateTime = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

const Entitlement = z.looseObject({
  expires_date: DateTime,
  grace_period_expires_date: DateTime.nullish(),
  product_identifier: z.string(),
});

const Subscription = z.looseObject({
  unsubscribe_detected_at: z.string().nullish(),
});

const SubscriberResponse = z.looseObject({
  request_date_ms: z.int().nonnegative(),
  subscriber: z.looseObject({
    entitlements: z.record(z.string(), z.unknown()),
    subscriptions: z.record(z.string(), z.unknown()),
  }),
});

type ObservedEvent = Extract<TurboEvent, { kind: "observed" }>;

const subscriptionOf = (
  subscriptions: Record<string, unknown>,
  product: string,
): z.infer<typeof Subscription> => {
  const parsed = Subscription.safeParse(subscriptions[product]);
  return parsed.success ? parsed.data : {};
};

const stateOf = ({
  entitlement,
  subscriptions,
  now,
}: {
  entitlement: z.infer<typeof Entitlement>;
  subscriptions: Record<string, unknown>;
  now: Date;
}): ObservedSubscription | undefined => {
  const subscription = subscriptionOf(subscriptions, entitlement.product_identifier);
  const willRenew = subscription.unsubscribe_detected_at == null;
  if (entitlement.expires_date > now) {
    return { expiresAt: entitlement.expires_date, willRenew, inGrace: false };
  }
  const graceEnd = entitlement.grace_period_expires_date;
  return graceEnd != null && graceEnd > now
    ? { expiresAt: graceEnd, willRenew, inGrace: true }
    : undefined;
};

export const observedTurbo = ({
  userId,
  body,
}: {
  userId: string;
  body: unknown;
}): Result<ObservedEvent, "malformed"> => {
  const parsed = SubscriberResponse.safeParse(body);
  if (!parsed.success) {
    return err("malformed");
  }
  const occurredAt = new Date(parsed.data.request_date_ms);
  const { entitlements, subscriptions } = parsed.data.subscriber;
  const observed = (state: ObservedSubscription | undefined): ObservedEvent => ({
    kind: "observed",
    userId,
    occurredAt,
    state,
  });
  if (!Object.hasOwn(entitlements, TURBO_ENTITLEMENT)) {
    return ok(observed(undefined));
  }
  const entitlement = Entitlement.safeParse(entitlements[TURBO_ENTITLEMENT]);
  return entitlement.success
    ? ok(observed(stateOf({ entitlement: entitlement.data, subscriptions, now: occurredAt })))
    : err("malformed");
};
