import { describe, expect, it } from "vitest";

import {
  MAX_CATEGORY_NAME_LENGTH,
  MAX_CATEGORY_SLUG_LENGTH,
  parseCategoryName,
  parseCategorySlug,
  parseCategoryTags,
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
    ["réservé à la route du catalogue (ADR 0050 §4)", "catalog"],
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

describe("tags d'une catégorie (ADR 0050)", () => {
  it("garde les tags dans leur ordre et leur casse, sans leurs espaces de bord", () => {
    expect(
      parseCategoryTags([" FPS ", "Shooter", "Rock & Roll", "Beat 'em up", "Point-and-click"]),
    ).toEqual({
      ok: true,
      value: ["FPS", "Shooter", "Rock & Roll", "Beat 'em up", "Point-and-click"],
    });
  });

  it("accepte une catégorie sans tag", () => {
    expect(parseCategoryTags([])).toEqual({ ok: true, value: [] });
  });

  it("accepte un tag de 24 caractères, accents compris", () => {
    const tag = `${"é".repeat(23)}1`;

    expect(parseCategoryTags([tag])).toEqual({ ok: true, value: [tag] });
  });

  it.each([
    ["six tags", ["a", "b", "c", "d", "e", "f"]],
    ["un tag vide", ["IRL", "  "]],
    ["un tag de 25 caractères", ["a".repeat(25)]],
    ["un tag avec un caractère hors format", ["FPS!"]],
    ["un tag avec un emoji", ["Jeux 🎮"]],
    ["un tag qui commence par un caractère hors format", ["#FPS"]],
    ["deux tags égaux à la casse près", ["FPS", "fps"]],
    ["deux tags égaux aux accents près", ["Rétro", "retro"]],
    ["deux tags égaux aux espaces de bord près", ["IRL", " IRL"]],
  ])("refuse %s", (_name, tags) => {
    expect(parseCategoryTags(tags)).toEqual({ ok: false, error: "invalid_tags" });
  });
});
