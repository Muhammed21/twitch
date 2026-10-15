import { describe, expect, it } from "vitest";

import { MAX_TITLE_LENGTH, parseChannelTitle } from "./channel-title.ts";

describe("titre d'une chaîne", () => {
  it("compte au plus 140 caractères", () => {
    expect(MAX_TITLE_LENGTH).toBe(140);
  });

  it("retire les espaces des bords", () => {
    expect(parseChannelTitle("  Speedrun du dimanche \n")).toEqual({
      ok: true,
      value: "Speedrun du dimanche",
    });
  });

  it("accepte un titre vide", () => {
    expect(parseChannelTitle("   ")).toEqual({ ok: true, value: "" });
  });

  it("accepte 140 caractères", () => {
    expect(parseChannelTitle("a".repeat(140))).toEqual({ ok: true, value: "a".repeat(140) });
  });

  it("refuse 141 caractères", () => {
    expect(parseChannelTitle("a".repeat(141))).toEqual({ ok: false, error: "title_too_long" });
  });

  it("compte un emoji pour un caractère", () => {
    expect(parseChannelTitle("🎮".repeat(140))).toEqual({ ok: true, value: "🎮".repeat(140) });
  });

  it("compte un emoji composé pour un caractère", () => {
    expect(parseChannelTitle("👨‍👩‍👧".repeat(140))).toEqual({ ok: true, value: "👨‍👩‍👧".repeat(140) });
  });

  it("refuse 141 emojis composés", () => {
    expect(parseChannelTitle("👨‍👩‍👧".repeat(141))).toEqual({ ok: false, error: "title_too_long" });
  });

  it("ne compte pas les espaces retirés", () => {
    expect(parseChannelTitle(` ${"a".repeat(140)} `)).toEqual({
      ok: true,
      value: "a".repeat(140),
    });
  });
});
