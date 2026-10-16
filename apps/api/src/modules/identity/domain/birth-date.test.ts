import { describe, expect, it } from "vitest";

import { MINIMUM_AGE_YEARS, parseBirthDate } from "./birth-date.ts";

const NOW = new Date("2026-10-16T09:30:00.000Z");

const parse = (value: unknown, now = NOW) => parseBirthDate({ value, now });

describe("date de naissance à l'inscription (ADR 0039, §3)", () => {
  it("exige 13 ans, comme Twitch", () => {
    expect(MINIMUM_AGE_YEARS).toBe(13);
  });

  it("accepte 13 ans pile et rend la date à minuit UTC", () => {
    expect(parse("2013-10-16")).toEqual({ ok: true, value: new Date("2013-10-16T00:00:00.000Z") });
  });

  it("refuse 12 ans et 364 jours", () => {
    expect(parse("2013-10-17")).toEqual({ ok: false, error: "too_young" });
  });

  it("accepte une date déjà construite, ramenée à son jour UTC", () => {
    expect(parse(new Date("2000-01-01T18:45:00.000Z"))).toEqual({
      ok: true,
      value: new Date("2000-01-01T00:00:00.000Z"),
    });
    expect(parse(new Date("2013-10-17T00:00:00.000Z"))).toEqual({ ok: false, error: "too_young" });
    expect(parse(new Date("pas une date"))).toEqual({ ok: false, error: "malformed" });
  });

  it("accepte un adulte", () => {
    expect(parse("1990-01-31").ok).toBe(true);
  });

  it("fête les 13 ans d'un 29 février le 1er mars d'une année non bissextile", () => {
    const born = "2008-02-29";

    expect(parse(born, new Date("2021-02-28T23:59:59.000Z"))).toEqual({
      ok: false,
      error: "too_young",
    });
    expect(parse(born, new Date("2021-03-01T00:00:00.000Z")).ok).toBe(true);
  });

  it("ne tient pas pour future une naissance du jour, même à minuit pile", () => {
    expect(parse("2026-10-16", new Date("2026-10-16T00:00:00.000Z"))).toEqual({
      ok: false,
      error: "too_young",
    });
  });

  it("refuse une date dans le futur", () => {
    expect(parse("2026-10-17")).toEqual({ ok: false, error: "future" });
  });

  it("refuse une date absente", () => {
    expect(parse(undefined)).toEqual({ ok: false, error: "missing" });
    expect(parse("")).toEqual({ ok: false, error: "missing" });
    expect(parse(null)).toEqual({ ok: false, error: "missing" });
  });

  it.each([
    "2000-02-30",
    "2001-02-29",
    "2000-13-01",
    "2000-00-10",
    "01/01/2000",
    "2000-1-1",
    "2000-01-01T00:00:00Z",
    "a2000-01-01",
    "12000-01-01",
    "0050-01-01",
    "0099-12-31",
    20000101,
    {},
  ])("refuse la date mal formée %j", (value) => {
    expect(parse(value)).toEqual({ ok: false, error: "malformed" });
  });
});
