import { describe, expect, it } from "vitest";

import { TURBO_ENTITLEMENT, translateRevenueCatEvent } from "./revenuecat-events.ts";

const USER_ID = "8d0a4c1e-5b6f-4a7d-9e8c-1f2a3b4c5d6e";
const OTHER_USER_ID = "2b7c9d1e-3f4a-4b5c-8d6e-7f8a9b0c1d2e";

const OCCURRED_AT_MS = 1_794_128_400_000;
const EXPIRES_AT_MS = 1_796_720_400_000;
const GRACE_ENDS_AT_MS = 1_797_325_200_000;

const makePayload = (event: Record<string, unknown> = {}) => ({
  api_version: "1.0",
  event: {
    id: "CDD5C0A2-5C5E-4E4E-9C8A-2E1A6B0F7D11",
    type: "INITIAL_PURCHASE",
    event_timestamp_ms: OCCURRED_AT_MS,
    app_user_id: USER_ID,
    entitlement_ids: [TURBO_ENTITLEMENT],
    expiration_at_ms: EXPIRES_AT_MS,
    original_transaction_id: "2000000123456789",
    ...event,
  },
});

const base = { userId: USER_ID, occurredAt: new Date(OCCURRED_AT_MS) };

describe("traduction des événements RevenueCat", () => {
  it("lit l'entitlement Turbo de RevenueCat sous l'identifiant turbo", () => {
    expect(TURBO_ENTITLEMENT).toBe("turbo");
  });

  it.each([
    ["INITIAL_PURCHASE", "purchased"],
    ["RENEWAL", "renewed"],
  ] as const)("traduit %s en %s avec l'échéance et l'achat d'origine", (type, kind) => {
    expect(translateRevenueCatEvent(makePayload({ type }))).toEqual({
      ok: true,
      value: {
        kind: "apply",
        event: {
          ...base,
          kind,
          expiresAt: new Date(EXPIRES_AT_MS),
          providerReference: "2000000123456789",
        },
      },
    });
  });

  it("garde un achat sans transaction d'origine", () => {
    expect(
      translateRevenueCatEvent(makePayload({ original_transaction_id: undefined })),
    ).toMatchObject({ value: { event: { providerReference: undefined } } });
  });

  it.each([
    ["EXPIRATION", "expired"],
    ["SUBSCRIPTION_PAUSED", "paused"],
    ["REFUND", "refunded"],
  ] as const)("traduit %s en %s", (type, kind) => {
    expect(translateRevenueCatEvent(makePayload({ type }))).toEqual({
      ok: true,
      value: { kind: "apply", event: { ...base, kind } },
    });
  });

  it("traduit une annulation en arrêt du renouvellement", () => {
    expect(
      translateRevenueCatEvent(makePayload({ type: "CANCELLATION", cancel_reason: "UNSUBSCRIBE" })),
    ).toEqual({
      ok: true,
      value: { kind: "apply", event: { ...base, kind: "renewal_cancelled" } },
    });
  });

  it("traduit une annulation par le support d'Apple en remboursement", () => {
    expect(
      translateRevenueCatEvent(
        makePayload({ type: "CANCELLATION", cancel_reason: "CUSTOMER_SUPPORT" }),
      ),
    ).toEqual({ ok: true, value: { kind: "apply", event: { ...base, kind: "refunded" } } });
  });

  it("traduit un problème de facturation avec la fin de la grâce", () => {
    expect(
      translateRevenueCatEvent(
        makePayload({ type: "BILLING_ISSUE", grace_period_expiration_at_ms: GRACE_ENDS_AT_MS }),
      ),
    ).toEqual({
      ok: true,
      value: {
        kind: "apply",
        event: { ...base, kind: "billing_issue", graceEndsAt: new Date(GRACE_ENDS_AT_MS) },
      },
    });
  });

  it.each([undefined, null])("traduit un problème de facturation sans grâce (%s)", (grace) => {
    expect(
      translateRevenueCatEvent(
        makePayload({ type: "BILLING_ISSUE", grace_period_expiration_at_ms: grace }),
      ),
    ).toMatchObject({ value: { event: { kind: "billing_issue", graceEndsAt: undefined } } });
  });

  it("traduit un transfert vers les comptes connus, sans regarder l'entitlement", () => {
    expect(
      translateRevenueCatEvent(
        makePayload({
          type: "TRANSFER",
          app_user_id: undefined,
          entitlement_ids: null,
          transferred_from: ["$RCAnonymousID:8f0e", USER_ID],
          transferred_to: [OTHER_USER_ID],
        }),
      ),
    ).toEqual({
      ok: true,
      value: {
        kind: "transfer",
        fromUserIds: [USER_ID],
        toUserId: OTHER_USER_ID,
        occurredAt: new Date(OCCURRED_AT_MS),
      },
    });
  });

  it("traduit un transfert sans origine connue", () => {
    expect(
      translateRevenueCatEvent(
        makePayload({
          type: "TRANSFER",
          transferred_from: undefined,
          transferred_to: [OTHER_USER_ID],
        }),
      ),
    ).toMatchObject({ ok: true, value: { kind: "transfer", fromUserIds: [] } });
  });

  it("écarte un transfert vers un compte inconnu", () => {
    expect(
      translateRevenueCatEvent(
        makePayload({
          type: "TRANSFER",
          transferred_from: [USER_ID],
          transferred_to: ["$RCAnonymousID:8f0e"],
        }),
      ),
    ).toEqual({ ok: false, error: "unknown_user" });
  });

  it.each(["UNCANCELLATION", "NON_RENEWING_PURCHASE", "TEMPORARY_ENTITLEMENT_GRANT", "TEST"])(
    "écarte le type non traité %s",
    (type) => {
      expect(translateRevenueCatEvent(makePayload({ type }))).toEqual({
        ok: false,
        error: "unhandled_type",
      });
    },
  );

  it.each([
    ["un autre entitlement", { entitlement_ids: ["pro"] }],
    ["aucun entitlement", { entitlement_ids: null }],
    ["une liste d'entitlements absente", { entitlement_ids: undefined }],
  ])("écarte un événement qui porte %s", (_name, event) => {
    expect(translateRevenueCatEvent(makePayload(event))).toEqual({
      ok: false,
      error: "other_entitlement",
    });
  });

  it("écarte un acheteur qui n'est pas un compte du backend", () => {
    expect(translateRevenueCatEvent(makePayload({ app_user_id: "$RCAnonymousID:8f0e" }))).toEqual({
      ok: false,
      error: "unknown_user",
    });
  });

  it.each([
    ["sans événement", { api_version: "1.0" }],
    ["un achat à échéance nulle", makePayload({ expiration_at_ms: null })],
    ["un achat sans échéance", makePayload({ expiration_at_ms: undefined })],
    ["un acheteur absent", makePayload({ app_user_id: undefined })],
    ["un horodatage absent", makePayload({ event_timestamp_ms: undefined })],
    [
      "un transfert sans destinataire",
      makePayload({ type: "TRANSFER", transferred_to: undefined }),
    ],
    ["un payload qui n'est pas un objet", "INITIAL_PURCHASE"],
  ])("refuse %s", (_name, payload) => {
    expect(translateRevenueCatEvent(payload)).toEqual({ ok: false, error: "malformed" });
  });
});
