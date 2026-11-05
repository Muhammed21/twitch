import { describe, expect, it } from "vitest";

import { events } from "../index.ts";

const SUBSCRIBER_ID = "8d0a4c1e-5b6f-4a7d-9e8c-1f2a3b4c5d6e";

const makeGrant = (overrides: Record<string, unknown> = {}) => ({
  userId: SUBSCRIBER_ID,
  scope: "platform",
  expiresAt: "2026-12-08T09:00:00.000Z",
  ...overrides,
});

const makeRevocation = (overrides: Record<string, unknown> = {}) => ({
  userId: SUBSCRIBER_ID,
  scope: "platform",
  ...overrides,
});

describe("monetization.entitlement.granted", () => {
  it("porte son nom et sa version", () => {
    expect(events.monetization.entitlementGranted).toMatchObject({
      name: "monetization.entitlement.granted",
      version: 1,
    });
  });

  it("décode l'abonné, la portée et l'échéance", () => {
    expect(events.monetization.entitlementGranted.payload.parse(makeGrant())).toEqual(makeGrant());
  });

  it("garde une portée qu'il ne connaît pas encore, pour que le consommateur l'ignore", () => {
    expect(
      events.monetization.entitlementGranted.payload.parse(makeGrant({ scope: "channel" })),
    ).toMatchObject({ scope: "channel" });
  });

  it("garde un champ ajouté plus tard par l'émetteur", () => {
    expect(
      events.monetization.entitlementGranted.payload.parse(makeGrant({ tier: "TIER_1" })),
    ).toMatchObject({ tier: "TIER_1" });
  });

  it.each([
    ["sans abonné", { userId: undefined }],
    ["avec un abonné qui n'est pas un UUID", { userId: "abonne" }],
    ["sans portée", { scope: undefined }],
    ["avec une portée vide", { scope: "" }],
    ["sans échéance", { expiresAt: undefined }],
    ["avec une échéance sans fuseau", { expiresAt: "2026-12-08T09:00:00" }],
  ])("refuse un event %s", (_name, overrides) => {
    expect(
      events.monetization.entitlementGranted.payload.safeParse(makeGrant(overrides)).success,
    ).toBe(false);
  });
});

describe("monetization.entitlement.revoked", () => {
  it("porte son nom et sa version", () => {
    expect(events.monetization.entitlementRevoked).toMatchObject({
      name: "monetization.entitlement.revoked",
      version: 1,
    });
  });

  it("décode l'abonné et la portée", () => {
    expect(events.monetization.entitlementRevoked.payload.parse(makeRevocation())).toEqual(
      makeRevocation(),
    );
  });

  it.each([
    ["sans abonné", { userId: undefined }],
    ["avec un abonné qui n'est pas un UUID", { userId: "abonne" }],
    ["sans portée", { scope: undefined }],
    ["avec une portée vide", { scope: "" }],
  ])("refuse un event %s", (_name, overrides) => {
    expect(
      events.monetization.entitlementRevoked.payload.safeParse(makeRevocation(overrides)).success,
    ).toBe(false);
  });
});
