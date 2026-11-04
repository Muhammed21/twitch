import { describe, expect, it } from "vitest";

import type { CategoryView } from "../domain/category-view.ts";
import { type CategoryViewReader, listCategoryLives } from "./category-reads.ts";
import type { ListedLive, ListLives, LivesRequest } from "./list-lives.ts";

const JUST_CHATTING = "0b5e4d3c-2a19-4f08-8e7d-6c5b4a392817";
const IRL = "1c6f5e4d-3b2a-4019-9f8e-7d6c5b4a3928";
const TALK = "2d7a6f5e-4c3b-4a2a-8a9f-8e7d6c5b4a39";
const ART = "3e8b7a6f-5d4c-4b3b-9b0a-9f8e7d6c5b4a";

const makeCategory = (overrides: Partial<CategoryView> = {}): CategoryView => ({
  categoryId: JUST_CHATTING,
  slug: "just-chatting",
  name: "Just Chatting",
  status: "active",
  mergedIntoId: null,
  ...overrides,
});

const CATEGORIES: readonly CategoryView[] = [
  makeCategory(),
  makeCategory({ categoryId: IRL, slug: "irl", name: "IRL" }),
  makeCategory({
    categoryId: TALK,
    slug: "talk",
    name: "Talk",
    status: "merged",
    mergedIntoId: IRL,
  }),
  makeCategory({ categoryId: ART, slug: "art", name: "Art", status: "retired" }),
];

const recordingReader = (views: readonly CategoryView[] = CATEGORIES) => {
  const asked: (readonly string[] | string)[] = [];
  const known = new Map(views.map((view) => [view.categoryId, view]));
  const reader: CategoryViewReader = {
    withMergeTargets: async (categoryIds) => {
      asked.push(categoryIds);
      return known;
    },
    aroundSlug: async (slug) => {
      asked.push(slug);
      return known;
    },
  };
  return { reader, asked };
};

const channelId = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

const makeLive = (index: number, categoryId: string | null): ListedLive => ({
  channelId: channelId(index),
  slug: `chaine_${index}`,
  title: `Live ${index}`,
  startedAt: new Date(Date.UTC(2026, 10, 4, 20, index)),
  categoryId,
});

const fixedLives = (items: readonly ListedLive[]) => {
  const requests: LivesRequest[] = [];
  const lives: ListLives = async (request) => {
    requests.push(request);
    return { items, next: undefined };
  };
  return { lives, requests };
};

describe("lives d'une catégorie", () => {
  const listFor = (slug: string) => {
    const { lives, requests } = fixedLives([makeLive(1, IRL)]);
    const { reader, asked } = recordingReader();
    return {
      requests,
      asked,
      result: listCategoryLives({ categories: reader, lives })({
        slug,
        after: undefined,
        limit: 20,
      }),
    };
  };

  it("lit les lives de la catégorie et de celles qui y ont été fusionnées", async () => {
    const { requests, result, asked } = listFor("irl");

    expect(await result).toEqual({
      ok: true,
      value: { items: [makeLive(1, IRL)], next: undefined },
    });
    expect(requests).toEqual([{ after: undefined, limit: 20, categoryIds: [IRL, TALK] }]);
    expect(asked).toEqual(["irl"]);
  });

  it("mène le slug d'une catégorie fusionnée aux lives de sa cible", async () => {
    const { requests, result } = listFor("talk");

    expect(await result).toMatchObject({ ok: true });
    expect(requests).toEqual([{ after: undefined, limit: 20, categoryIds: [IRL, TALK] }]);
  });

  it.each([
    ["inconnue", "minecraft"],
    ["retirée", "art"],
  ])("ne trouve pas une catégorie %s", async (_name, slug) => {
    const { requests, result } = listFor(slug);

    expect(await result).toEqual({ ok: false, error: "category_not_found" });
    expect(requests).toEqual([]);
  });
});
