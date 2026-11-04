import { describe, expect, it } from "vitest";

import {
  MAX_CATEGORY_NAME_LENGTH,
  MAX_CATEGORY_SLUG_LENGTH,
  parseCategoryName,
  parseCategorySlug,
} from "./category.ts";

describe("slug d'une catégorie", () => {
  it.each(["just-chatting", "gta-v", "irl", "counter-strike-2", "a"])("accepte %s", (slug) => {
    expect(parseCategorySlug(slug)).toEqual({ ok: true, value: slug });
  });

  it(`accepte ${MAX_CATEGORY_SLUG_LENGTH} caractères`, () => {
    const slug = "a".repeat(MAX_CATEGORY_SLUG_LENGTH);

    expect(parseCategorySlug(slug)).toEqual({ ok: true, value: slug });
  });

  it.each([
    ["vide", ""],
    ["en majuscules", "Just-Chatting"],
    ["avec un espace", "just chatting"],
    ["avec un tiret en tête", "-irl"],
    ["avec un tiret final", "irl-"],
    ["avec deux tirets de suite", "just--chatting"],
    ["avec un accent", "musique-électro"],
    ["avec un souligné", "just_chatting"],
    ["trop long", "a".repeat(MAX_CATEGORY_SLUG_LENGTH + 1)],
  ])("refuse un slug %s", (_name, slug) => {
    expect(parseCategorySlug(slug)).toEqual({ ok: false, error: "invalid_slug" });
  });
});

describe("nom d'une catégorie", () => {
  it("garde le nom sans ses espaces de bord", () => {
    expect(parseCategoryName("  Just Chatting ")).toEqual({ ok: true, value: "Just Chatting" });
  });

  it(`accepte ${MAX_CATEGORY_NAME_LENGTH} caractères`, () => {
    const name = "é".repeat(MAX_CATEGORY_NAME_LENGTH);

    expect(parseCategoryName(name)).toEqual({ ok: true, value: name });
  });

  it.each([
    ["vide", ""],
    ["fait d'espaces", "   "],
    ["trop long", "é".repeat(MAX_CATEGORY_NAME_LENGTH + 1)],
  ])("refuse un nom %s", (_name, name) => {
    expect(parseCategoryName(name)).toEqual({ ok: false, error: "invalid_name" });
  });
});
