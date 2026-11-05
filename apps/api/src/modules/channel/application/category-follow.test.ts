import { describe, expect, it } from "vitest";

import { err, ok } from "@repo/result";

import type { CategoryFollowPair } from "../domain/category-follow.ts";
import { type CategoryFollows, followCategory, unfollowCategory } from "./category-follow.ts";

const NOW = new Date("2026-11-04T12:00:00.000Z");
const FOLLOWED_AT = new Date("2026-11-01T09:00:00.000Z");
const VIEWER = "6b4c1e3a-9d5f-4a0c-b132-4e7f8a9b0c1d";
const EVENT_ID = "2f3e4d5c-6b7a-4c9b-8a01-8a7f6e5d4c3b";

const FOLLOWED: CategoryFollowPair = {
  state: "following",
  followedAt: FOLLOWED_AT,
  version: 1,
  endedReason: null,
};

const memoryFollows = ({
  slugs = ["just-chatting"],
  pair = null,
}: {
  slugs?: readonly string[];
  pair?: CategoryFollowPair | null;
} = {}) => {
  const changes: {
    userId: string;
    slug: string;
    next: CategoryFollowPair | null;
    outboxEventId: string;
    occurredAt: Date;
  }[] = [];
  const follows: CategoryFollows = {
    change: async ({ userId, slug, transition, outboxEventId, occurredAt }) => {
      if (!slugs.includes(slug)) {
        return err("category_not_found");
      }
      changes.push({ userId, slug, next: transition(pair), outboxEventId, occurredAt });
      return ok(undefined);
    },
  };
  return { follows, changes };
};

const dependencies = (follows: CategoryFollows) => ({
  follows,
  newId: () => EVENT_ID,
  now: () => NOW,
});

describe("followCategory (ADR 0049)", () => {
  it("ouvre le suivi de la catégorie du slug, maintenant, avec l'id de l'event d'outbox", async () => {
    const { follows, changes } = memoryFollows();

    const followed = await followCategory(dependencies(follows))({
      userId: VIEWER,
      slug: "just-chatting",
    });

    expect(followed).toEqual(ok(undefined));
    expect(changes).toEqual([
      {
        userId: VIEWER,
        slug: "just-chatting",
        next: { state: "following", followedAt: NOW, version: 1, endedReason: null },
        outboxEventId: EVENT_ID,
        occurredAt: NOW,
      },
    ]);
  });

  it("ne change rien à une catégorie déjà suivie", async () => {
    const { follows, changes } = memoryFollows({ pair: FOLLOWED });

    await followCategory(dependencies(follows))({ userId: VIEWER, slug: "just-chatting" });

    expect(changes.map(({ next }) => next)).toEqual([null]);
  });

  it("rend category_not_found pour un slug sans catégorie suivable", async () => {
    const { follows } = memoryFollows({ slugs: [] });

    expect(
      await followCategory(dependencies(follows))({ userId: VIEWER, slug: "inconnue" }),
    ).toEqual(err("category_not_found"));
  });
});

describe("unfollowCategory (ADR 0049)", () => {
  it("clôt le suivi de la catégorie du slug, pour la raison unfollowed", async () => {
    const { follows, changes } = memoryFollows({ pair: FOLLOWED });

    const unfollowed = await unfollowCategory(dependencies(follows))({
      userId: VIEWER,
      slug: "just-chatting",
    });

    expect(unfollowed).toEqual(ok(undefined));
    expect(changes).toEqual([
      {
        userId: VIEWER,
        slug: "just-chatting",
        next: { state: "not_following", followedAt: null, version: 2, endedReason: "unfollowed" },
        outboxEventId: EVENT_ID,
        occurredAt: NOW,
      },
    ]);
  });

  it("rend category_not_found pour un slug sans catégorie suivable", async () => {
    const { follows } = memoryFollows({ slugs: [] });

    expect(
      await unfollowCategory(dependencies(follows))({ userId: VIEWER, slug: "inconnue" }),
    ).toEqual(err("category_not_found"));
  });
});
