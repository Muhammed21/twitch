import { describe, expect, it } from "vitest";

import { CATALOG_PAGE_SIZE, type CategorySearch, searchCategories } from "./category-search.ts";
import type { ChannelCategoryView } from "./channel-queries.ts";

const JUST_CHATTING: ChannelCategoryView = {
  id: "7c6d5e4f-3a2b-4c1d-8e9f-0a1b2c3d4e5f",
  slug: "just-chatting",
  name: "Just Chatting",
};

const recordingSearch = () => {
  const searches: Parameters<CategorySearch["search"]>[0][] = [];
  const catalog: CategorySearch = {
    search: async (request) => {
      searches.push(request);
      return [JUST_CHATTING];
    },
  };
  return { catalog, searches };
};

describe("recherche dans le catalogue des catégories", () => {
  it("cherche le texte saisi sans ses espaces de bord, et rend les catégories trouvées", async () => {
    const { catalog, searches } = recordingSearch();

    expect(await searchCategories(catalog)("  just ")).toEqual([JUST_CHATTING]);
    expect(searches).toEqual([{ nameContains: "just", limit: CATALOG_PAGE_SIZE }]);
  });

  it.each([
    ["sans texte", undefined],
    ["avec un texte vide", ""],
    ["avec un texte fait d'espaces", "   "],
  ])("rend tout le catalogue %s", async (_name, query) => {
    const { catalog, searches } = recordingSearch();

    await searchCategories(catalog)(query);

    expect(searches).toEqual([{ limit: CATALOG_PAGE_SIZE }]);
  });

  it("borne une page à 100 catégories", () => {
    expect(CATALOG_PAGE_SIZE).toBe(100);
  });
});
