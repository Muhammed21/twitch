import { describe, expect, it } from "vitest";

import { observedTurbo } from "./revenuecat-subscriber.ts";

const USER_ID = "8d0a4c1e-5b6f-4a7d-9e8c-1f2a3b4c5d6e";

const REQUEST_DATE = "2026-11-08T09:00:00Z";
const REQUEST_DATE_MS = Date.parse(REQUEST_DATE);
const EXPIRES_DATE = "2026-12-08T09:00:00Z";
const PAST_DATE = "2026-11-01T09:00:00Z";
const GRACE_END = "2026-11-24T09:00:00Z";

const PRODUCT = "turbo_monthly";

const makeSubscriber = ({
  entitlement = {},
  subscription = {},
  entitlements,
}: {
  entitlement?: Record<string, unknown>;
  subscription?: Record<string, unknown>;
  entitlements?: Record<string, unknown>;
} = {}) => ({
  request_date: REQUEST_DATE,
  request_date_ms: REQUEST_DATE_MS,
  subscriber: {
    entitlements: entitlements ?? {
      turbo: {
        expires_date: EXPIRES_DATE,
        grace_period_expires_date: null,
        product_identifier: PRODUCT,
        purchase_date: "2026-11-08T08:59:00Z",
        ...entitlement,
      },
    },
    subscriptions: {
      [PRODUCT]: {
        expires_date: EXPIRES_DATE,
        grace_period_expires_date: null,
        unsubscribe_detected_at: null,
        billing_issues_detected_at: null,
        store: "app_store",
        ...subscription,
      },
    },
  },
});

const observedAt = new Date(REQUEST_DATE_MS);

describe("abonné RevenueCat lu en observation Turbo (ADR 0051 §2)", () => {
  it("traduit un abonné Turbo actif qui renouvelle", () => {
    expect(observedTurbo({ userId: USER_ID, body: makeSubscriber() })).toEqual({
      ok: true,
      value: {
        kind: "observed",
        userId: USER_ID,
        occurredAt: observedAt,
        state: { expiresAt: new Date(EXPIRES_DATE), willRenew: true, inGrace: false },
      },
    });
  });

  it("note un renouvellement annulé", () => {
    const body = makeSubscriber({ subscription: { unsubscribe_detected_at: REQUEST_DATE } });

    expect(observedTurbo({ userId: USER_ID, body })).toMatchObject({
      value: { state: { willRenew: false } },
    });
  });

  it("traduit un abonné en délai de grâce, jusqu'à la fin de la grâce", () => {
    const body = makeSubscriber({
      entitlement: { expires_date: PAST_DATE, grace_period_expires_date: GRACE_END },
      subscription: { billing_issues_detected_at: PAST_DATE },
    });

    expect(observedTurbo({ userId: USER_ID, body })).toMatchObject({
      value: { state: { expiresAt: new Date(GRACE_END), willRenew: true, inGrace: true } },
    });
  });

  it.each([
    ["sans entitlement Turbo", makeSubscriber({ entitlements: {} })],
    [
      "avec un entitlement Turbo échu",
      makeSubscriber({ entitlement: { expires_date: PAST_DATE } }),
    ],
    [
      "dont la grâce est échue",
      makeSubscriber({
        entitlement: { expires_date: PAST_DATE, grace_period_expires_date: PAST_DATE },
      }),
    ],
    ["avec un autre entitlement seulement", makeSubscriber({ entitlements: { pro: {} } })],
    [
      "dont l'échéance tombe à l'instant de la lecture",
      makeSubscriber({ entitlement: { expires_date: REQUEST_DATE } }),
    ],
    [
      "dont la grâce finit à l'instant de la lecture",
      makeSubscriber({
        entitlement: { expires_date: PAST_DATE, grace_period_expires_date: REQUEST_DATE },
      }),
    ],
  ])("observe l'absence d'abonnement pour un abonné %s", (_name, body) => {
    expect(observedTurbo({ userId: USER_ID, body })).toEqual({
      ok: true,
      value: { kind: "observed", userId: USER_ID, occurredAt: observedAt, state: undefined },
    });
  });

  it("lit une échéance exprimée avec un décalage horaire", () => {
    const body = makeSubscriber({ entitlement: { expires_date: "2026-12-08T10:00:00+01:00" } });

    expect(observedTurbo({ userId: USER_ID, body })).toMatchObject({
      value: { state: { expiresAt: new Date(EXPIRES_DATE) } },
    });
  });

  it("garde l'échéance de l'entitlement quand l'abonnement n'est pas listé", () => {
    const body = {
      ...makeSubscriber(),
      subscriber: { ...makeSubscriber().subscriber, subscriptions: {} },
    };

    expect(observedTurbo({ userId: USER_ID, body })).toMatchObject({
      value: { state: { expiresAt: new Date(EXPIRES_DATE), willRenew: true, inGrace: false } },
    });
  });

  it.each([
    ["qui n'est pas un objet", "oups"],
    ["sans horodatage de requête", { ...makeSubscriber(), request_date_ms: undefined }],
    ["sans abonné", { request_date_ms: REQUEST_DATE_MS }],
    ["avec un abonné sans entitlements", { request_date_ms: REQUEST_DATE_MS, subscriber: {} }],
    [
      "avec une échéance qui n'est pas une date",
      makeSubscriber({ entitlement: { expires_date: "demain" } }),
    ],
    ["avec un Turbo sans échéance", makeSubscriber({ entitlement: { expires_date: null } })],
  ])("refuse une réponse %s", (_name, body) => {
    expect(observedTurbo({ userId: USER_ID, body })).toEqual({ ok: false, error: "malformed" });
  });
});
