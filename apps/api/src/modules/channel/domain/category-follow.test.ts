import { describe, expect, it } from "vitest";

import { type CategoryFollowPair, startFollowing, stopFollowing } from "./category-follow.ts";

const FOLLOWED_AT = new Date("2026-11-01T09:00:00.000Z");
const NOW = new Date("2026-11-04T12:00:00.000Z");

const FOLLOWING_STATE = { state: "following", followedAt: FOLLOWED_AT, endedReason: null } as const;

const ENDED_STATE = {
  state: "not_following",
  followedAt: null,
  endedReason: "unfollowed",
} as const;

const makePair = (
  state: typeof FOLLOWING_STATE | typeof ENDED_STATE,
  { version }: { version: number },
): CategoryFollowPair => ({ ...state, version });

describe("suivre une catégorie (ADR 0049 §2)", () => {
  it("ouvre la paire à la version 1, suivie depuis maintenant", () => {
    expect(startFollowing(null, NOW)).toEqual({
      state: "following",
      followedAt: NOW,
      version: 1,
      endedReason: null,
    });
  });

  it("reprend une paire close à la version suivante, avec followedAt remis à maintenant", () => {
    expect(startFollowing(makePair(ENDED_STATE, { version: 4 }), NOW)).toEqual({
      state: "following",
      followedAt: NOW,
      version: 5,
      endedReason: null,
    });
  });

  it("ne change rien à une paire déjà suivie", () => {
    expect(startFollowing(makePair(FOLLOWING_STATE, { version: 3 }), NOW)).toBeNull();
  });
});

describe("ne plus suivre une catégorie (ADR 0049 §2)", () => {
  it("clôt une paire suivie à la version suivante, avec sa raison", () => {
    expect(stopFollowing(makePair(FOLLOWING_STATE, { version: 2 }), "unfollowed")).toEqual({
      state: "not_following",
      followedAt: null,
      version: 3,
      endedReason: "unfollowed",
    });
  });

  it("ne change rien à une paire déjà close", () => {
    expect(stopFollowing(makePair(ENDED_STATE, { version: 2 }), "unfollowed")).toBeNull();
  });

  it("ne crée aucune paire pour une catégorie jamais suivie", () => {
    expect(stopFollowing(null, "unfollowed")).toBeNull();
  });
});
