import { describe, expect, it } from "vitest";

import type { CategoryView } from "../domain/category-view.ts";
import {
  browseCategories,
  type CategoryViewReader,
  type LiveCategory,
  listCategoryLives,
} from "./category-reads.ts";
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

const liveCategory = (index: number, categoryId: string): LiveCategory => ({
  channelId: channelId(index),
  categoryId,
});

const viewerCountsOf =
  (counts: Readonly<Record<number, number>>) => async (channelIds: readonly string[]) =>
    new Map(
      channelIds.flatMap((id) => {
        const index = Number(id.slice(-12));
        const count = counts[index];
        return count === undefined ? [] : [[id, count] as const];
      }),
    );

const browse = ({
  lives,
  counts = {},
  categories = CATEGORIES,
  failure,
}: {
  lives: readonly LiveCategory[];
  counts?: Readonly<Record<number, number>>;
  categories?: readonly CategoryView[];
  failure?: Error;
}) => {
  const failures: unknown[] = [];
  return {
    failures,
    read: browseCategories({
      liveCategories: async () => lives,
      categories: categoryReader(categories),
      viewerCounts:
        failure === undefined ? viewerCountsOf(counts) : async () => Promise.reject(failure),
      onViewerCountFailure: (error) => failures.push(error),
    }),
  };
};

describe("catégories en live de Browse", () => {
  it("ne lit que les catégories des lives en cours", async () => {
    const { reader, asked } = recordingReader();

    await browseCategories({
      liveCategories: async () => [
        liveCategory(1, IRL),
        liveCategory(2, TALK),
        liveCategory(3, IRL),
      ],
      categories: reader,
      viewerCounts: viewerCountsOf({}),
      onViewerCountFailure: () => {},
    })();

    expect(asked).toEqual([[IRL, TALK]]);
  });

  it("compte les lives et somme les viewers de chaque catégorie, la plus regardée d'abord", async () => {
    const { read } = browse({
      lives: [liveCategory(1, JUST_CHATTING), liveCategory(2, IRL), liveCategory(3, IRL)],
      counts: { 1: 500, 2: 30, 3: 40 },
    });

    expect(await read()).toEqual([
      { slug: "just-chatting", name: "Just Chatting", liveCount: 1, viewerCount: 500 },
      { slug: "irl", name: "IRL", liveCount: 2, viewerCount: 70 },
    ]);
  });

  it("range les lives d'une catégorie fusionnée sous sa cible", async () => {
    const { read } = browse({
      lives: [liveCategory(1, TALK), liveCategory(2, IRL)],
      counts: { 1: 5, 2: 7 },
    });

    expect(await read()).toEqual([{ slug: "irl", name: "IRL", liveCount: 2, viewerCount: 12 }]);
  });

  it("compte zéro viewer pour un live dont le nombre manque", async () => {
    const { read } = browse({ lives: [liveCategory(1, IRL)] });

    expect(await read()).toEqual([{ slug: "irl", name: "IRL", liveCount: 1, viewerCount: 0 }]);
  });

  it("départage à viewers égaux par le nombre de lives, puis par le nom", async () => {
    const { read } = browse({
      categories: [
        makeCategory(),
        makeCategory({ categoryId: ART, slug: "art", name: "Art" }),
        makeCategory({ categoryId: TALK, slug: "talk", name: "Talk" }),
      ],
      lives: [
        liveCategory(1, TALK),
        liveCategory(2, ART),
        liveCategory(3, JUST_CHATTING),
        liveCategory(4, JUST_CHATTING),
      ],
      counts: { 1: 10, 2: 10, 3: 4, 4: 6 },
    });

    expect((await read()).map(({ slug }) => slug)).toEqual(["just-chatting", "art", "talk"]);
  });

  it("ignore un live dont la catégorie est retirée ou inconnue", async () => {
    const { read } = browse({
      lives: [liveCategory(1, ART), liveCategory(2, "4f9c8b7a-6e5d-4c4c-8c1b-0a9f8e7d6c5b")],
    });

    expect(await read()).toEqual([]);
  });

  it("range par nombre de lives, sans viewers, quand leur lecture échoue", async () => {
    const failure = new Error("redis indisponible");
    const { read, failures } = browse({
      lives: [liveCategory(1, JUST_CHATTING), liveCategory(2, IRL), liveCategory(3, IRL)],
      failure,
    });

    expect(await read()).toEqual([
      { slug: "irl", name: "IRL", liveCount: 2 },
      { slug: "just-chatting", name: "Just Chatting", liveCount: 1 },
    ]);
    expect(failures).toEqual([failure]);
  });
});

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
