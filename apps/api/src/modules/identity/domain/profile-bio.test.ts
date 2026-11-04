import { describe, expect, it } from "vitest";

import { MAX_BIO_LENGTH, parseBio } from "./profile-bio.ts";

describe("bio d'un profil", () => {
  it("compte au plus 300 caractères", () => {
    expect(MAX_BIO_LENGTH).toBe(300);
  });

  it("retire les espaces des bords", () => {
    expect(parseBio("  Speedrun le dimanche \n")).toEqual({
      ok: true,
      value: "Speedrun le dimanche",
    });
  });

  it("rend une bio vide pour une saisie faite d'espaces", () => {
    expect(parseBio("   ")).toEqual({ ok: true, value: "" });
  });

  it("accepte 300 caractères", () => {
    expect(parseBio("a".repeat(300))).toEqual({ ok: true, value: "a".repeat(300) });
  });

  it("refuse 301 caractères", () => {
    expect(parseBio("a".repeat(301))).toEqual({ ok: false, error: "bio_too_long" });
  });

  it("compte un emoji composé pour un caractère", () => {
    expect(parseBio("👨‍👩‍👧".repeat(300))).toEqual({ ok: true, value: "👨‍👩‍👧".repeat(300) });
  });

  it("refuse 301 emojis composés", () => {
    expect(parseBio("👨‍👩‍👧".repeat(301))).toEqual({ ok: false, error: "bio_too_long" });
  });

  it("accepte 3 000 unités de code UTF-16", () => {
    const bio = `${"a".repeat(299)}${"\u0301".repeat(2701)}`;

    expect(parseBio(bio)).toEqual({ ok: true, value: bio });
  });

  it("refuse un caractère chargé de milliers de diacritiques, au-delà de 3 000 unités de code", () => {
    expect(parseBio(`a${"\u0301".repeat(3000)}`)).toEqual({ ok: false, error: "bio_too_long" });
  });

  it("ne compte pas les espaces retirés", () => {
    expect(parseBio(` ${"a".repeat(300)} `)).toEqual({ ok: true, value: "a".repeat(300) });
  });
});
