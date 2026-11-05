import { describe, expect, it } from "vitest";

import type { CategoryView } from "../domain/category-view.ts";
import {
  type AudiencePosition,
  browseCategories,
  type BrowsedCategory,
  type CategoryAudience,
  type LiveInCategory,
  refreshCategoryAudience,
} from "./category-audience.ts";

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
  tags: [],
  ...overrides,
});

const CATEGORIES = new Map(
  [
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
  ].map((view) => [view.categoryId, view]),
);

const channelId = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

const live = (index: number, categoryId: string): LiveInCategory => ({
  channelId: channelId(index),
  categoryId,
});

const refresh = ({
  lives,
  counts = {},
  failure,
  batchSize = 2,
}: {
  lives: readonly LiveInCategory[];
  counts?: Readonly<Record<number, number>>;
  failure?: Error;
  batchSize?: number;
}) => {
  const pages: { after: string | undefined; take: number }[] = [];
  const asked: (readonly string[])[] = [];
  const stored: (readonly CategoryAudience[])[] = [];
  const run = refreshCategoryAudience({
    lives: async ({ after, take }) => {
      pages.push({ after, take });
      return lives.filter(({ channelId: id }) => after === undefined || id > after).slice(0, take);
    },
    categories: {
      withMergeTargets: async (categoryIds) => {
        asked.push(categoryIds);
        return CATEGORIES;
      },
    },
    viewerCounts: async (channelIds) => {
      if (failure !== undefined) {
        throw failure;
      }
      return new Map(
        channelIds.flatMap((id) => {
          const count = counts[Number(id.slice(-12))];
          return count === undefined ? [] : [[id, count] as const];
        }),
      );
    },
    store: {
      replace: async (audiences) => {
        stored.push(audiences);
      },
    },
    batchSize,
  });
  return { run, pages, asked, stored };
};

describe("audience des catégories", () => {
  it("compte les lives et somme les viewers de chaque catégorie, fusions suivies, lot par lot", async () => {
    const { run, pages, asked, stored } = refresh({
      lives: [live(1, JUST_CHATTING), live(2, TALK), live(3, IRL)],
      counts: { 1: 500, 2: 30, 3: 40 },
    });

    await run();

    expect(pages).toEqual([
      { after: undefined, take: 2 },
      { after: channelId(2), take: 2 },
    ]);
    expect(asked).toEqual([[JUST_CHATTING, TALK], [IRL]]);
    expect(stored).toEqual([
      [
        { categoryId: JUST_CHATTING, liveCount: 1, viewerCount: 500 },
        { categoryId: IRL, liveCount: 2, viewerCount: 70 },
      ],
    ]);
  });

  it("relit après un lot plein, jusqu'au premier lot vide", async () => {
    const { run, pages, asked } = refresh({ lives: [live(1, IRL), live(2, IRL)] });

    await run();

    expect(pages).toEqual([
      { after: undefined, take: 2 },
      { after: channelId(2), take: 2 },
    ]);
    expect(asked).toEqual([[IRL]]);
  });

  it("compte zéro viewer pour un live dont le nombre manque", async () => {
    const { run, stored } = refresh({ lives: [live(1, IRL)] });

    await run();

    expect(stored).toEqual([[{ categoryId: IRL, liveCount: 1, viewerCount: 0 }]]);
  });

  it("ignore un live dont la catégorie est retirée ou inconnue", async () => {
    const { run, stored } = refresh({
      lives: [live(1, ART), live(2, "4f9c8b7a-6e5d-4c4c-8c1b-0a9f8e7d6c5b")],
    });

    await run();

    expect(stored).toEqual([[]]);
  });

  it("garde l'agrégat précédent quand la lecture des viewers échoue", async () => {
    const failure = new Error("redis indisponible");
    const { run, stored } = refresh({ lives: [live(1, IRL)], failure });

    await expect(run()).rejects.toBe(failure);
    expect(stored).toEqual([]);
  });
});

const makeBrowsed = (overrides: Partial<BrowsedCategory> = {}): BrowsedCategory => ({
  categoryId: IRL,
  slug: "irl",
  imageKey: null,
  tags: [],
  name: "IRL",
  liveCount: 2,
  viewerCount: 70,
  ...overrides,
});

const browse = (rows: readonly BrowsedCategory[]) => {
  const requests: { after: AudiencePosition | undefined; take: number }[] = [];
  const read = browseCategories({
    page: async (request) => {
      requests.push(request);
      return rows;
    },
  });
  return { read, requests };
};

describe("catégories de Browse", () => {
  it("lit une catégorie de plus que la page, après le curseur, et rend la position de la dernière", async () => {
    const after = { viewerCount: 500, liveCount: 1, categoryId: JUST_CHATTING };
    const first = makeBrowsed();
    const { read, requests } = browse([first, makeBrowsed({ categoryId: TALK })]);

    expect(await read({ after, limit: 1 })).toEqual({
      items: [first],
      next: { viewerCount: 70, liveCount: 2, categoryId: IRL },
    });
    expect(requests).toEqual([{ after, take: 2 }]);
  });

  it("ne rend pas de position quand la page est la dernière", async () => {
    const { read } = browse([makeBrowsed()]);

    expect(await read({ after: undefined, limit: 1 })).toEqual({
      items: [makeBrowsed()],
      next: undefined,
    });
  });
});
