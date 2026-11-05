import { describe, expect, it } from "vitest";

import type { CategoryView } from "../domain/category-view.ts";
import {
  type CategoryAudienceLookup,
  type CategoryFollowLookup,
  type CategoryViewReader,
  listCategoryLives,
  readCategoryHeader,
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
  imageKey: null,
  tags: [],
  ...overrides,
});

const CATEGORIES: readonly CategoryView[] = [
  makeCategory(),
  makeCategory({
    categoryId: IRL,
    slug: "irl",
    name: "IRL",
    imageKey: "images/category/irl.webp",
    tags: ["IRL", "Discussion"],
  }),
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
  avatarKey: null,
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

const VIEWER_ID = "6b4c1e3a-9d5f-4a0c-b132-4e7f8a9b0c1d";

const followsOf = ({
  followerCounts = {},
  followedBy = {},
}: {
  followerCounts?: Readonly<Record<string, number>>;
  followedBy?: Readonly<Record<string, readonly string[]>>;
}): CategoryFollowLookup => ({
  followerCountOf: async (categoryId) => followerCounts[categoryId] ?? 0,
  isFollowing: async ({ userId, categoryId }) => (followedBy[categoryId] ?? []).includes(userId),
});

describe("en-tête d'une catégorie (ADR 0050)", () => {
  const audienceOf =
    (known: Readonly<Record<string, { liveCount: number; viewerCount: number }>>) =>
    (asked: string[]): CategoryAudienceLookup => ({
      of: async (categoryId) => {
        asked.push(categoryId);
        return known[categoryId] ?? null;
      },
    });

  const headerFor = async (
    slug: string,
    known: Readonly<Record<string, { liveCount: number; viewerCount: number }>> = {},
    {
      viewerId,
      follows = followsOf({}),
    }: { viewerId?: string; follows?: CategoryFollowLookup } = {},
  ) => {
    const asked: string[] = [];
    const { reader } = recordingReader();
    const result = await readCategoryHeader({
      categories: reader,
      audience: audienceOf(known)(asked),
      follows,
    })({ slug, viewerId });
    return { result, asked };
  };

  it("rend le nom, la pochette, les tags et l'audience de la catégorie", async () => {
    const { result, asked } = await headerFor("irl", { [IRL]: { liveCount: 2, viewerCount: 70 } });

    expect(result).toEqual({
      ok: true,
      value: {
        categoryId: IRL,
        slug: "irl",
        name: "IRL",
        imageKey: "images/category/irl.webp",
        tags: ["IRL", "Discussion"],
        liveCount: 2,
        viewerCount: 70,
        followerCount: 0,
      },
    });
    expect(asked).toEqual([IRL]);
  });

  it("rend le nombre de followers de la catégorie (ADR 0049 §6)", async () => {
    const { result } = await headerFor(
      "irl",
      {},
      {
        follows: followsOf({ followerCounts: { [IRL]: 12 } }),
      },
    );

    expect(result).toMatchObject({ ok: true, value: { followerCount: 12 } });
    expect(result.ok && "isFollowing" in result.value).toBe(false);
  });

  it.each([
    ["suit", [VIEWER_ID], true],
    ["ne suit pas", [], false],
  ] as const)(
    "dit au compte connecté qu'il %s la catégorie",
    async (_name, followers, isFollowing) => {
      const { result } = await headerFor(
        "irl",
        {},
        {
          viewerId: VIEWER_ID,
          follows: followsOf({ followedBy: { [IRL]: followers } }),
        },
      );

      expect(result).toMatchObject({ ok: true, value: { isFollowing } });
    },
  );

  it("lit le suivi et le compteur de la cible d'une catégorie fusionnée", async () => {
    const { result } = await headerFor(
      "talk",
      {},
      {
        viewerId: VIEWER_ID,
        follows: followsOf({
          followerCounts: { [IRL]: 3, [TALK]: 9 },
          followedBy: { [IRL]: [VIEWER_ID] },
        }),
      },
    );

    expect(result).toMatchObject({
      ok: true,
      value: { slug: "irl", followerCount: 3, isFollowing: true },
    });
  });

  it("rend une audience nulle pour une catégorie sans live", async () => {
    const { result } = await headerFor("just-chatting");

    expect(result).toMatchObject({
      ok: true,
      value: { slug: "just-chatting", liveCount: 0, viewerCount: 0 },
    });
  });

  it("mène le slug d'une catégorie fusionnée à l'en-tête de sa cible", async () => {
    const { result } = await headerFor("talk", { [IRL]: { liveCount: 1, viewerCount: 5 } });

    expect(result).toMatchObject({
      ok: true,
      value: { slug: "irl", liveCount: 1, viewerCount: 5 },
    });
  });

  it.each(["inconnue", "art"])("ne trouve pas la catégorie %s", async (slug) => {
    const { result, asked } = await headerFor(slug);

    expect(result).toEqual({ ok: false, error: "category_not_found" });
    expect(asked).toEqual([]);
  });
});
