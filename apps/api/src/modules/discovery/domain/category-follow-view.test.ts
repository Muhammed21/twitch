import { describe, expect, it } from "vitest";

import {
  applyCategoryFollowEvent,
  type CategoryFollowEvent,
  type CategoryFollowView,
  followerCounts,
  followerDelta,
} from "./category-follow-view.ts";

const USER_ID = "6b4c1e3a-9d5f-4a0c-b132-4e7f8a9b0c1d";
const OTHER_USER_ID = "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e";
const CATEGORY_ID = "7c6d5e4f-3a2b-4c1d-8e9f-0a1b2c3d4e5f";
const OTHER_CATEGORY_ID = "8d7e6f5a-4b3c-4d2e-9f0a-1b2c3d4e5f6a";

const makeEvent = ({
  following,
  version,
}: {
  following: boolean;
  version: number;
}): CategoryFollowEvent => ({
  kind: "category-follow-changed",
  userId: USER_ID,
  categoryId: CATEGORY_ID,
  following,
  version,
});

const makeView = ({
  following,
  version,
}: {
  following: boolean;
  version: number;
}): CategoryFollowView => ({ userId: USER_ID, categoryId: CATEGORY_ID, following, version });

describe("projection du suivi d'une catégorie (ADR 0049 §6)", () => {
  it("ouvre la paire au premier event", () => {
    expect(applyCategoryFollowEvent(null, makeEvent({ following: true, version: 1 }))).toEqual(
      makeView({ following: true, version: 1 }),
    );
  });

  it("applique un event de version plus haute", () => {
    expect(
      applyCategoryFollowEvent(
        makeView({ following: true, version: 1 }),
        makeEvent({ following: false, version: 2 }),
      ),
    ).toEqual(makeView({ following: false, version: 2 }));
  });

  it.each([
    ["égale", 2],
    ["plus basse", 1],
  ])("ignore un event de version %s à celle de la paire", (_name, version) => {
    expect(
      applyCategoryFollowEvent(
        makeView({ following: false, version: 2 }),
        makeEvent({ following: true, version }),
      ),
    ).toBeNull();
  });

  const v1 = makeEvent({ following: true, version: 1 });
  const v2 = makeEvent({ following: false, version: 2 });
  const v3 = makeEvent({ following: true, version: 3 });

  it.each([
    ["v1, v2, v3", [v1, v2, v3]],
    ["v1, v3, v2", [v1, v3, v2]],
    ["v2, v1, v3", [v2, v1, v3]],
    ["v2, v3, v1", [v2, v3, v1]],
    ["v3, v1, v2", [v3, v1, v2]],
    ["v3, v2, v1", [v3, v2, v1]],
  ])("converge vers le dernier état dans l'ordre %s", (_order, received) => {
    const final = received.reduce<CategoryFollowView | null>(
      (view, event) => applyCategoryFollowEvent(view, event) ?? view,
      null,
    );

    expect(final).toEqual(makeView({ following: true, version: 3 }));
  });
});

describe("variation du nombre de followers", () => {
  it.each([
    ["un premier suivi", null, true, 1],
    ["une paire close qui reprend", false, true, 1],
    ["une paire suivie qui se clôt", true, false, -1],
    ["une première paire close", null, false, 0],
    ["une paire close qui reste close", false, false, 0],
  ] as const)("compte %s", (_name, before, after, delta) => {
    expect(
      followerDelta(
        before === null ? null : makeView({ following: before, version: 1 }),
        makeView({ following: after, version: 2 }),
      ),
    ).toBe(delta);
  });
});

describe("nombre de followers par catégorie, pour la reconstruction", () => {
  it("compte les paires suivies de chaque catégorie, et seulement elles", () => {
    expect(
      followerCounts([
        makeView({ following: true, version: 1 }),
        { ...makeView({ following: true, version: 3 }), userId: OTHER_USER_ID },
        { ...makeView({ following: false, version: 2 }), categoryId: OTHER_CATEGORY_ID },
        {
          ...makeView({ following: true, version: 1 }),
          userId: OTHER_USER_ID,
          categoryId: OTHER_CATEGORY_ID,
        },
      ]),
    ).toEqual([
      { categoryId: CATEGORY_ID, followerCount: 2 },
      { categoryId: OTHER_CATEGORY_ID, followerCount: 1 },
    ]);
  });
});
