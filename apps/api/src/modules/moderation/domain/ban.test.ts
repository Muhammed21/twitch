import { describe, expect, it } from "vitest";

import {
  banEnd,
  MAX_BAN_MINUTES,
  MAX_BAN_REASON_LENGTH,
  parseBanReason,
  parseBanTerm,
} from "./ban.ts";

const ISSUED_AT = new Date("2026-11-06T12:00:00.000Z");

describe("durée d'un bannissement", () => {
  it("borne un bannissement à un an", () => {
    expect(MAX_BAN_MINUTES).toBe(365 * 24 * 60);
  });

  it.each([1, 60, MAX_BAN_MINUTES])("accepte %i minutes", (minutes) => {
    expect(parseBanTerm(minutes)).toEqual({ ok: true, value: minutes });
  });

  it("accepte un bannissement définitif, sans durée", () => {
    expect(parseBanTerm(null)).toEqual({ ok: true, value: null });
  });

  it.each([0, -1, 1.5, MAX_BAN_MINUTES + 1, Number.NaN])("refuse %d minutes", (minutes) => {
    expect(parseBanTerm(minutes)).toEqual({ ok: false, error: "invalid_duration" });
  });

  it("finit un bannissement temporaire après sa durée", () => {
    const term = parseBanTerm(90);
    expect(term.ok && banEnd({ issuedAt: ISSUED_AT, term: term.value })).toEqual(
      new Date("2026-11-06T13:30:00.000Z"),
    );
  });

  it("ne finit jamais un bannissement définitif", () => {
    const term = parseBanTerm(null);
    expect(term.ok && banEnd({ issuedAt: ISSUED_AT, term: term.value })).toBeNull();
  });
});

describe("motif d'un bannissement", () => {
  it("garde le motif sans les blancs qui l'entourent", () => {
    expect(parseBanReason("  Harcèlement répété \n")).toEqual({
      ok: true,
      value: "Harcèlement répété",
    });
  });

  it("accepte un motif d'un caractère", () => {
    expect(parseBanReason("x")).toEqual({ ok: true, value: "x" });
  });

  it("accepte un motif de 500 caractères", () => {
    expect(MAX_BAN_REASON_LENGTH).toBe(500);
    expect(parseBanReason("a".repeat(500))).toEqual({ ok: true, value: "a".repeat(500) });
  });

  it.each([
    ["vide", ""],
    ["fait de blancs", "   "],
    ["trop long", "a".repeat(501)],
  ])("refuse un motif %s", (_name, reason) => {
    expect(parseBanReason(reason)).toEqual({ ok: false, error: "invalid_reason" });
  });
});
