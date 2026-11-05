import { describe, expect, it } from "vitest";

import { authorizationMatches, readRevenueCatWebhook } from "./revenuecat-webhook.ts";

const EXPECTED = "Bearer valeur-choisie-dans-revenuecat";

const makeEnvelope = (
  event: Record<string, unknown> = {},
  envelope: Record<string, unknown> = {},
) => ({
  api_version: "1.0",
  event: {
    id: "CDD5C0A2-5C5E-4E4E-9C8A-2E1A6B0F7D11",
    type: "INITIAL_PURCHASE",
    event_timestamp_ms: 1_794_128_400_000,
    app_user_id: "8d0a4c1e-5b6f-4a7d-9e8c-1f2a3b4c5d6e",
    ...event,
  },
  ...envelope,
});

const bodyOf = (value: unknown) => Buffer.from(JSON.stringify(value));

describe("en-tête Authorization du webhook RevenueCat", () => {
  it("accepte la valeur attendue", () => {
    expect(authorizationMatches({ expected: EXPECTED, received: EXPECTED })).toBe(true);
  });

  it.each([
    ["absent", undefined],
    ["vide", ""],
    ["faux", "Bearer autre-valeur"],
    ["préfixe de la valeur attendue", EXPECTED.slice(0, -1)],
    ["valeur attendue suivie d'un caractère", `${EXPECTED}x`],
  ])("refuse un en-tête %s", (_name, received) => {
    expect(authorizationMatches({ expected: EXPECTED, received })).toBe(false);
  });
});

describe("lecture d'un webhook RevenueCat", () => {
  it("rend l'identifiant de l'événement et le payload tel que reçu", () => {
    const envelope = makeEnvelope({ product_id: "turbo_monthly", store: "APP_STORE" });

    expect(readRevenueCatWebhook(bodyOf(envelope))).toEqual({
      eventId: "CDD5C0A2-5C5E-4E4E-9C8A-2E1A6B0F7D11",
      payload: envelope,
    });
  });

  it("accepte un type d'événement qu'il ne connaît pas encore", () => {
    expect(
      readRevenueCatWebhook(bodyOf(makeEnvelope({ type: "TEMPORARY_ENTITLEMENT_GRANT" }))),
    ).not.toBeNull();
  });

  it.each([
    ["pas du JSON", Buffer.from("{pas du json")],
    ["un corps vide", Buffer.alloc(0)],
    ["un tableau", bodyOf([makeEnvelope()])],
    ["sans api_version", bodyOf({ event: makeEnvelope().event })],
    ["sans événement", bodyOf({ api_version: "1.0" })],
    ["un événement sans identifiant", bodyOf(makeEnvelope({ id: undefined }))],
    ["un identifiant vide", bodyOf(makeEnvelope({ id: "" }))],
    ["un identifiant de plus de 128 caractères", bodyOf(makeEnvelope({ id: "a".repeat(129) }))],
    ["un événement sans type", bodyOf(makeEnvelope({ type: undefined }))],
    ["un type vide", bodyOf(makeEnvelope({ type: "" }))],
    ["sans horodatage", bodyOf(makeEnvelope({ event_timestamp_ms: undefined }))],
    ["un horodatage négatif", bodyOf(makeEnvelope({ event_timestamp_ms: -1 }))],
    ["un horodatage décimal", bodyOf(makeEnvelope({ event_timestamp_ms: 1.5 }))],
    ["un horodatage en texte", bodyOf(makeEnvelope({ event_timestamp_ms: "1794128400000" }))],
  ])("refuse %s", (_name, body) => {
    expect(readRevenueCatWebhook(body)).toBeNull();
  });

  it("accepte un identifiant de 128 caractères", () => {
    expect(readRevenueCatWebhook(bodyOf(makeEnvelope({ id: "a".repeat(128) })))).toMatchObject({
      eventId: "a".repeat(128),
    });
  });
});
