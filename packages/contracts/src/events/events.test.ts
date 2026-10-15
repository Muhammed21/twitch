import { describe, expect, it } from "vitest";

import { events } from "../index.ts";

const ACCOUNT_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";

describe("identity.account.registered", () => {
  it("porte son nom et sa version", () => {
    expect(events.identity.accountRegistered).toMatchObject({
      name: "identity.account.registered",
      version: 1,
    });
  });

  it("décode le compte inscrit", () => {
    expect(events.identity.accountRegistered.payload.parse({ accountId: ACCOUNT_ID })).toEqual({
      accountId: ACCOUNT_ID,
    });
  });

  it("garde un champ ajouté plus tard par l'émetteur", () => {
    expect(
      events.identity.accountRegistered.payload.parse({ accountId: ACCOUNT_ID, locale: "fr" }),
    ).toMatchObject({ locale: "fr" });
  });

  it.each([
    ["sans compte", {}],
    ["avec un compte qui n'est pas un UUID", { accountId: "FWGDz5f2dSosyWpO6un25VBOMSsnkVjk" }],
  ])("refuse un event %s", (_name, payload) => {
    expect(events.identity.accountRegistered.payload.safeParse(payload).success).toBe(false);
  });
});
