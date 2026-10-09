import { describe, expect, it } from "vitest";
import { z } from "zod";

import { extensibleUnion, openEnum, Uuid } from "../index.ts";

const StreamState = openEnum(["live", "ended"]);

const Entitlement = extensibleUnion("state", [
  z.looseObject({ state: z.literal("active"), expiresAt: z.iso.datetime() }),
  z.looseObject({ state: z.literal("expired") }),
]);

describe("openEnum", () => {
  it("accepte une valeur connue", () => {
    expect(StreamState.parse("live")).toBe("live");
  });

  it("accepte une valeur ajoutée plus tard par le serveur", () => {
    expect(StreamState.parse("scheduled")).toBe("scheduled");
  });

  it("refuse ce qui n'est pas une chaîne", () => {
    expect(StreamState.safeParse(3).success).toBe(false);
  });

  it("publie les valeurs connues et une chaîne libre", () => {
    expect(z.toJSONSchema(StreamState)).toMatchObject({
      anyOf: [{ type: "string", enum: ["live", "ended"] }, { type: "string" }],
    });
  });
});

describe("Uuid", () => {
  it("accepte un UUID et refuse un identifiant mal formé", () => {
    expect(Uuid.safeParse("4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b").success).toBe(true);
    expect(Uuid.safeParse("4f2a9c1e").success).toBe(false);
  });

  it("est un schéma nommé Uuid", () => {
    expect(z.globalRegistry.get(Uuid)).toEqual({ id: "Uuid" });
  });
});

describe("extensibleUnion", () => {
  it("décode une variante connue", () => {
    expect(Entitlement.parse({ state: "expired" })).toEqual({ state: "expired" });
  });

  it("décode une variante inconnue par la variante de repli, sans perdre ses champs", () => {
    expect(Entitlement.parse({ state: "grace_period", until: "2026-11-01" })).toEqual({
      state: "grace_period",
      until: "2026-11-01",
    });
  });

  it("refuse un objet sans discriminant", () => {
    expect(Entitlement.safeParse({ expiresAt: "2026-11-01T00:00:00Z" }).success).toBe(false);
  });

  it("place la variante de repli en dernier", () => {
    expect(z.toJSONSchema(Entitlement)).toMatchObject({
      anyOf: [{}, {}, { type: "object", properties: { state: { type: "string" } } }],
    });
  });
});
