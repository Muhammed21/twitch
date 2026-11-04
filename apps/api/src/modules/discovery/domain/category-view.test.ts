import { describe, expect, it } from "vitest";

import {
  applyCategoryEvent,
  type CategoryEvent,
  type CategoryView,
  resolveCategory,
} from "./category-view.ts";

const SOURCE = "0b5e4d3c-2a19-4f08-8e7d-6c5b4a392817";
const TARGET = "1c6f5e4d-3b2a-4019-9f8e-7d6c5b4a3928";
const FINAL = "2d7a6f5e-4c3b-4a2a-8a9f-8e7d6c5b4a39";

const makeView = (overrides: Partial<CategoryView> = {}): CategoryView => ({
  categoryId: SOURCE,
  slug: "just-chatting",
  name: "Just Chatting",
  status: "active",
  mergedIntoId: null,
  imageKey: null,
  ...overrides,
});

const created: CategoryEvent = {
  kind: "category-created",
  categoryId: SOURCE,
  slug: "just-chatting",
  name: "Just Chatting",
};

const mergedInto = (targetCategoryId: string): CategoryEvent => ({
  kind: "category-merged",
  categoryId: SOURCE,
  targetCategoryId,
});

const retired: CategoryEvent = { kind: "category-retired", categoryId: SOURCE };

const updated: CategoryEvent = {
  kind: "category-updated",
  categoryId: SOURCE,
  name: "Discussion",
  imageKey: "images/category/jc.webp",
};

const viewsOf = (...views: readonly CategoryView[]): ReadonlyMap<string, CategoryView> =>
  new Map(views.map((view) => [view.categoryId, view]));

describe("vue d'une catégorie dans discovery", () => {
  it("connaît une catégorie créée, active", () => {
    expect(applyCategoryEvent(null, created)).toEqual(makeView());
  });

  it("marque fusionnée une catégorie et retient sa cible", () => {
    expect(applyCategoryEvent(makeView(), mergedInto(TARGET))).toEqual(
      makeView({ status: "merged", mergedIntoId: TARGET }),
    );
  });

  it("marque retirée une catégorie", () => {
    expect(applyCategoryEvent(makeView(), retired)).toEqual(makeView({ status: "retired" }));
  });

  it("prend le nom et la pochette d'une catégorie mise à jour", () => {
    expect(applyCategoryEvent(makeView(), updated)).toEqual(
      makeView({ name: "Discussion", imageKey: "images/category/jc.webp" }),
    );
  });

  it("retire la pochette quand la mise à jour n'en porte plus", () => {
    expect(
      applyCategoryEvent(makeView({ imageKey: "images/category/jc.webp" }), {
        kind: "category-updated",
        categoryId: SOURCE,
        name: "Just Chatting",
        imageKey: null,
      }),
    ).toEqual(makeView());
  });

  it("garde la pochette d'une mise à jour arrivée avant la création", () => {
    const early = applyCategoryEvent(null, updated);

    expect(applyCategoryEvent(early, created)).toEqual(
      makeView({ imageKey: "images/category/jc.webp" }),
    );
  });

  it.each([
    ["une fusion", mergedInto(TARGET), { status: "merged", mergedIntoId: TARGET }],
    ["un retrait", retired, { status: "retired" }],
  ] as const)("garde l'état d'%s arrivé avant la création", (_name, event, state) => {
    const early = applyCategoryEvent(null, event);

    expect(early).toEqual(makeView({ slug: null, name: "", ...state }));
    expect(applyCategoryEvent(early, created)).toEqual(makeView(state));
  });
});

describe("résolution d'une catégorie dans discovery", () => {
  it("rend une catégorie active telle quelle", () => {
    expect(resolveCategory(viewsOf(makeView()), SOURCE)).toEqual({
      categoryId: SOURCE,
      slug: "just-chatting",
      name: "Just Chatting",
      imageKey: null,
    });
  });

  it("suit les fusions jusqu'à la catégorie active", () => {
    const views = viewsOf(
      makeView({ status: "merged", mergedIntoId: TARGET }),
      makeView({ categoryId: TARGET, slug: "irl", status: "merged", mergedIntoId: FINAL }),
      makeView({
        categoryId: FINAL,
        slug: "talk",
        name: "Talk",
        imageKey: "images/category/talk.webp",
      }),
    );

    expect(resolveCategory(views, SOURCE)).toEqual({
      categoryId: FINAL,
      slug: "talk",
      name: "Talk",
      imageKey: "images/category/talk.webp",
    });
  });

  it.each([
    ["inconnue", viewsOf()],
    ["retirée", viewsOf(makeView({ status: "retired" }))],
    ["dont la création n'est pas arrivée", viewsOf(makeView({ slug: null }))],
    [
      "fusionnée dans une catégorie inconnue",
      viewsOf(makeView({ status: "merged", mergedIntoId: TARGET })),
    ],
    [
      "prise dans un cycle de fusions",
      viewsOf(
        makeView({ status: "merged", mergedIntoId: TARGET }),
        makeView({ categoryId: TARGET, status: "merged", mergedIntoId: SOURCE }),
      ),
    ],
  ])("ne rend rien pour une catégorie %s", (_name, views) => {
    expect(resolveCategory(views, SOURCE)).toBeNull();
  });
});
