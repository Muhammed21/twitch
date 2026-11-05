export type EntitlementStatus = "active" | "grace" | "expired" | "revoked";

export type TurboEntitlement = {
  readonly id: string;
  readonly userId: string;
  readonly status: EntitlementStatus;
  readonly expiresAt: Date;
  readonly willRenew: boolean;
  readonly providerReference: string | undefined;
  readonly lastEventAt: Date;
};

type EventBase = { readonly userId: string; readonly occurredAt: Date };

export type ObservedSubscription = {
  readonly expiresAt: Date;
  readonly willRenew: boolean;
  readonly inGrace: boolean;
};

export type SubscribedEvent = EventBase & {
  readonly kind: "purchased" | "renewed";
  readonly expiresAt: Date;
  readonly providerReference: string | undefined;
};

export type TurboEvent =
  | SubscribedEvent
  | (EventBase & { readonly kind: "renewal_cancelled" | "expired" | "paused" | "refunded" })
  | (EventBase & { readonly kind: "billing_issue"; readonly graceEndsAt: Date | undefined })
  | (EventBase & { readonly kind: "observed"; readonly state: ObservedSubscription | undefined });

export type EntitlementChange =
  | { readonly type: "granted"; readonly userId: string; readonly expiresAt: Date }
  | { readonly type: "revoked"; readonly userId: string };

export type TurboDecision = {
  readonly outcome: "applied" | "ignored" | "stale";
  readonly saved: readonly TurboEntitlement[];
  readonly changes: readonly EntitlementChange[];
};

const IGNORED: TurboDecision = { outcome: "ignored", saved: [], changes: [] };
const STALE: TurboDecision = { outcome: "stale", saved: [], changes: [] };

const isActive = (entitlement: TurboEntitlement | undefined): entitlement is TurboEntitlement =>
  entitlement !== undefined && (entitlement.status === "active" || entitlement.status === "grace");

const granted = (entitlement: TurboEntitlement): EntitlementChange => ({
  type: "granted",
  userId: entitlement.userId,
  expiresAt: entitlement.expiresAt,
});

const update = (before: TurboEntitlement, after: TurboEntitlement): TurboDecision => ({
  outcome: "applied",
  saved: [after],
  changes: after.expiresAt.getTime() === before.expiresAt.getTime() ? [] : [granted(after)],
});

const create = (entitlement: TurboEntitlement): TurboDecision => ({
  outcome: "applied",
  saved: [entitlement],
  changes: [granted(entitlement)],
});

const end = (
  current: TurboEntitlement | undefined,
  status: "expired" | "revoked",
  occurredAt: Date,
): TurboDecision =>
  isActive(current)
    ? {
        outcome: "applied",
        saved: [{ ...current, status, lastEventAt: occurredAt }],
        changes: [{ type: "revoked", userId: current.userId }],
      }
    : IGNORED;

const subscribe = ({
  current,
  userId,
  occurredAt,
  state,
  providerReference,
  newId,
}: {
  current: TurboEntitlement | undefined;
  userId: string;
  occurredAt: Date;
  state: ObservedSubscription;
  providerReference: string | undefined;
  newId: () => string;
}): TurboDecision => {
  const fields = {
    status: state.inGrace ? "grace" : "active",
    expiresAt: state.expiresAt,
    willRenew: state.willRenew,
    lastEventAt: occurredAt,
  } as const;
  return isActive(current)
    ? update(current, {
        ...current,
        ...fields,
        providerReference: providerReference ?? current.providerReference,
      })
    : create({ id: newId(), userId, providerReference, ...fields });
};

const decide = (
  current: TurboEntitlement | undefined,
  event: TurboEvent,
  newId: () => string,
): TurboDecision => {
  const { userId, occurredAt } = event;
  switch (event.kind) {
    case "purchased":
    case "renewed":
      return subscribe({
        current,
        userId,
        occurredAt,
        newId,
        providerReference: event.providerReference,
        state: { expiresAt: event.expiresAt, willRenew: true, inGrace: false },
      });
    case "observed":
      return event.state === undefined
        ? end(current, "expired", occurredAt)
        : subscribe({
            current,
            userId,
            occurredAt,
            newId,
            providerReference: undefined,
            state: event.state,
          });
    case "renewal_cancelled":
      return isActive(current)
        ? update(current, { ...current, willRenew: false, lastEventAt: occurredAt })
        : IGNORED;
    case "billing_issue":
      return isActive(current)
        ? update(current, {
            ...current,
            status: "grace",
            expiresAt: event.graceEndsAt ?? current.expiresAt,
            lastEventAt: occurredAt,
          })
        : IGNORED;
    case "expired":
    case "paused":
      return end(current, "expired", occurredAt);
    case "refunded":
      return end(current, "revoked", occurredAt);
  }
};

export const applyTurboEvent = ({
  current,
  event,
  newId,
}: {
  current: TurboEntitlement | undefined;
  event: TurboEvent;
  newId: () => string;
}): TurboDecision =>
  current !== undefined && event.occurredAt < current.lastEventAt
    ? STALE
    : decide(current, event, newId);

const later = (left: Date, right: Date): Date =>
  new Date(Math.max(left.getTime(), right.getTime()));

export const transferTurbo = ({
  origins,
  target,
  toUserId,
  occurredAt,
  newId,
}: {
  origins: readonly TurboEntitlement[];
  target: TurboEntitlement | undefined;
  toUserId: string;
  occurredAt: Date;
  newId: () => string;
}): TurboDecision => {
  const moved = origins.filter(
    (origin) => isActive(origin) && origin.userId !== toUserId && origin.lastEventAt <= occurredAt,
  );
  const [first, ...others] = moved;
  if (first === undefined) {
    return IGNORED;
  }
  const source = others.reduce(
    (longest, origin) => (origin.expiresAt > longest.expiresAt ? origin : longest),
    first,
  );
  const revoked = moved.map((origin) => ({
    ...origin,
    status: "revoked" as const,
    lastEventAt: occurredAt,
  }));
  const received = isActive(target)
    ? update(target, {
        ...target,
        expiresAt: later(target.expiresAt, source.expiresAt),
        lastEventAt: later(target.lastEventAt, occurredAt),
      })
    : create({
        id: newId(),
        userId: toUserId,
        status: source.status,
        expiresAt: source.expiresAt,
        willRenew: source.willRenew,
        providerReference: source.providerReference,
        lastEventAt: occurredAt,
      });
  return {
    outcome: "applied",
    saved: [...revoked, ...received.saved],
    changes: [
      ...moved.map((origin): EntitlementChange => ({ type: "revoked", userId: origin.userId })),
      ...received.changes,
    ],
  };
};
