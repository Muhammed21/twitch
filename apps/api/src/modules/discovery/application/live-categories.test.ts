import { describe, expect, it } from "vitest";

import type { CategoryView } from "../domain/category-view.ts";
import type { ListedLive, ListLives, LivesRequest } from "./list-lives.ts";
import { type CategoryTargets, withLiveCategories } from "./live-categories.ts";

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
  imageKey: null,
  ...overrides,
});

const CATEGORIES: readonly CategoryView[] = [
  makeCategory(),
  makeCategory({ categoryId: IRL, slug: "irl", name: "IRL", imageKey: "images/category/irl.webp" }),
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
  const asked: (readonly string[])[] = [];
  const known = new Map(views.map((view) => [view.categoryId, view]));
  const reader: CategoryTargets = {
    withMergeTargets: async (categoryIds) => {
      asked.push(categoryIds);
      return known;
    },
  };
  return { reader, asked };
};

const categoryReader = (views?: readonly CategoryView[]) => recordingReader(views).reader;

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

describe("catégorie de chaque live", () => {
  it("donne à un live le slug, le nom et la pochette de sa catégorie", async () => {
    const { lives } = fixedLives([makeLive(1, JUST_CHATTING)]);

    const page = await withLiveCategories({ lives, categories: categoryReader() })({
      after: undefined,
      limit: 20,
    });

    expect(page.items[0]?.category).toEqual({
      slug: "just-chatting",
      name: "Just Chatting",
      imageKey: null,
    });
  });

  it("donne à un live d'une catégorie fusionnée la catégorie cible, avec sa pochette", async () => {
    const { lives } = fixedLives([makeLive(1, TALK)]);

    const page = await withLiveCategories({ lives, categories: categoryReader() })({
      after: undefined,
      limit: 20,
    });

    expect(page.items[0]?.category).toEqual({
      slug: "irl",
      name: "IRL",
      imageKey: "images/category/irl.webp",
    });
  });

  it.each([
    ["sans catégorie", null],
    ["d'une catégorie retirée", ART],
    ["d'une catégorie inconnue", "4f9c8b7a-6e5d-4c4c-8c1b-0a9f8e7d6c5b"],
  ])("ne donne aucune catégorie à un live %s", async (_name, categoryId) => {
    const { lives } = fixedLives([makeLive(1, categoryId)]);

    const page = await withLiveCategories({ lives, categories: categoryReader() })({
      after: undefined,
      limit: 20,
    });

    expect(page.items[0]).not.toHaveProperty("category");
  });

  it("ne lit que les catégories des lives de la page, et aucune pour une page vide", async () => {
    const { reader, asked } = recordingReader();
    const page = [makeLive(1, IRL), makeLive(2, null), makeLive(3, TALK), makeLive(4, IRL)];

    await withLiveCategories({ lives: fixedLives(page).lives, categories: reader })({
      after: undefined,
      limit: 20,
    });
    await withLiveCategories({ lives: fixedLives([]).lives, categories: reader })({
      after: undefined,
      limit: 20,
    });

    expect(asked).toEqual([[IRL, TALK]]);
  });
});
