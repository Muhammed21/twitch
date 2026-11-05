import { describe, expect, it } from "vitest";

import { listCategoryTags } from "./category-tags.ts";

const listOf = (tagLists: readonly (readonly string[])[]) =>
  listCategoryTags({ tagsOfActiveCategories: async () => tagLists })();

describe("tags des catégories actives (ADR 0050, ADR 0051)", () => {
  it("rend une fois un tag que deux catégories partagent, avec le nombre de catégories qui le portent", async () => {
    expect(await listOf([["Shooter", "RPG"], ["Shooter"]])).toEqual([
      { name: "Shooter", categoryCount: 2 },
      { name: "RPG", categoryCount: 1 },
    ]);
  });

  it.each([
    ["aucune catégorie active", []],
    ["des catégories sans tag", [[], []]],
  ])("rend une liste vide pour %s", async (_name, tagLists) => {
    expect(await listOf(tagLists)).toEqual([]);
  });

  it("trie par nombre de catégories décroissant, puis par libellé dans l'ordre du français", async () => {
    expect(
      await listOf([["FPS", "Échecs", "Dessin"], ["Musique", "FPS"], ["Musique"], ["Échecs"]]),
    ).toEqual([
      { name: "Échecs", categoryCount: 2 },
      { name: "FPS", categoryCount: 2 },
      { name: "Musique", categoryCount: 2 },
      { name: "Dessin", categoryCount: 1 },
    ]);
  });

  it("garde la casse d'affichage et réunit les libellés égaux sans tenir compte de la casse ni des accents", async () => {
    expect(await listOf([["FPS"], ["fps"], ["FPS"], ["Echecs"], ["Échecs"], ["Échecs"]])).toEqual([
      { name: "Échecs", categoryCount: 3 },
      { name: "FPS", categoryCount: 3 },
    ]);
  });

  it("affiche l'écriture que portent le plus de catégories", async () => {
    expect(await listOf([["fps"], ["fps"], ["FPS"]])).toEqual([{ name: "fps", categoryCount: 3 }]);
  });

  it("affiche, à égalité, l'écriture la plus petite dans l'ordre des codes", async () => {
    expect(await listOf([["Rpg"], ["RPG"]])).toEqual([{ name: "RPG", categoryCount: 2 }]);
    expect(await listOf([["RPG"], ["Rpg"]])).toEqual([{ name: "RPG", categoryCount: 2 }]);
  });
});
