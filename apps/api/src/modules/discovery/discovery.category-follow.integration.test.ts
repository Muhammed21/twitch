import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { createContextClient } from "@repo/db";

import { rebuildDiscoveryProjection } from "./discovery.module.ts";
import { applyCategoryFollowEvent } from "./domain/category-follow-view.ts";
import {
  prismaCategoryFollowLookup,
  prismaCategoryFollowProjection,
} from "./infrastructure/prisma-category-follow-projection.ts";

const urlOf = (variable: string): string => {
  const url = process.env[variable];
  if (url === undefined) {
    throw new Error(`${variable} manquante`);
  }
  return url;
};

const discovery = createContextClient({ context: "discovery", env: process.env });
const channelDb = createContextClient({ context: "channel", env: process.env });
const outboxPool = new Pool({ connectionString: urlOf("DATABASE_URL_PROJECTION_REBUILD") });
const follows = prismaCategoryFollowProjection(discovery);

afterAll(async () => {
  await outboxPool.end();
  await Promise.all([discovery.$disconnect(), channelDb.$disconnect()]);
});

const project = ({
  eventId = randomUUID(),
  userId,
  categoryId,
  following,
  version,
}: {
  eventId?: string;
  userId: string;
  categoryId: string;
  following: boolean;
  version: number;
}) =>
  follows.update({
    eventId,
    userId,
    categoryId,
    change: (view) =>
      applyCategoryFollowEvent(view, {
        kind: "category-follow-changed",
        userId,
        categoryId,
        following,
        version,
      }),
  });

const pairOf = (userId: string, categoryId: string) =>
  discovery.discoveryCategoryFollow.findUnique({
    where: { userId_categoryId: { userId, categoryId } },
    select: { following: true, version: true },
  });

const followerCountOf = async (categoryId: string) =>
  (
    await discovery.discoveryCategoryFollowerCount.findUnique({
      where: { categoryId },
      select: { followerCount: true },
    })
  )?.followerCount ?? 0;

describe("projection du suivi d'une catégorie dans discovery (ADR 0049 §6)", () => {
  it("ouvre la paire et compte un follower au premier suivi", async () => {
    const userId = randomUUID();
    const categoryId = randomUUID();

    await project({ userId, categoryId, following: true, version: 1 });

    expect(await pairOf(userId, categoryId)).toEqual({ following: true, version: 1 });
    expect(await followerCountOf(categoryId)).toBe(1);
  });

  it("compte chaque compte qui suit la catégorie", async () => {
    const categoryId = randomUUID();

    await project({ userId: randomUUID(), categoryId, following: true, version: 1 });
    await project({ userId: randomUUID(), categoryId, following: true, version: 1 });

    expect(await followerCountOf(categoryId)).toBe(2);
  });

  it("décompte un follower qui quitte la catégorie", async () => {
    const userId = randomUUID();
    const categoryId = randomUUID();
    await project({ userId, categoryId, following: true, version: 1 });

    await project({ userId, categoryId, following: false, version: 2 });

    expect(await pairOf(userId, categoryId)).toEqual({ following: false, version: 2 });
    expect(await followerCountOf(categoryId)).toBe(0);
  });

  it("ignore un event en retard, sans toucher au compteur", async () => {
    const userId = randomUUID();
    const categoryId = randomUUID();
    await project({ userId, categoryId, following: false, version: 2 });

    await project({ userId, categoryId, following: true, version: 1 });

    expect(await pairOf(userId, categoryId)).toEqual({ following: false, version: 2 });
    expect(await followerCountOf(categoryId)).toBe(0);
  });

  it("ignore un event rejoué sous le même identifiant", async () => {
    const userId = randomUUID();
    const categoryId = randomUUID();
    const eventId = randomUUID();
    await project({ eventId, userId, categoryId, following: true, version: 1 });
    await project({ userId, categoryId, following: false, version: 2 });

    await project({ eventId, userId, categoryId, following: true, version: 3 });

    expect(await pairOf(userId, categoryId)).toEqual({ following: false, version: 2 });
  });

  it("compte une seule fois les events simultanés d'une même paire", async () => {
    const userId = randomUUID();
    const categoryId = randomUUID();

    await Promise.all(
      [1, 2, 3, 4, 5].map((version) =>
        project({ userId, categoryId, following: version % 2 === 1, version }),
      ),
    );

    expect(await pairOf(userId, categoryId)).toEqual({ following: true, version: 5 });
    expect(await followerCountOf(categoryId)).toBe(1);
  });
});

describe("lecture du suivi pour l'en-tête d'une catégorie (ADR 0049 §6)", () => {
  const lookup = prismaCategoryFollowLookup(discovery);

  it("lit le nombre de followers, et zéro pour une catégorie jamais suivie", async () => {
    const categoryId = randomUUID();
    await project({ userId: randomUUID(), categoryId, following: true, version: 1 });
    await project({ userId: randomUUID(), categoryId, following: true, version: 1 });

    expect(await lookup.followerCountOf(categoryId)).toBe(2);
    expect(await lookup.followerCountOf(randomUUID())).toBe(0);
  });

  it("dit qu'un compte suit la catégorie seulement quand sa paire est suivie", async () => {
    const categoryId = randomUUID();
    const follower = randomUUID();
    const former = randomUUID();
    await project({ userId: follower, categoryId, following: true, version: 1 });
    await project({ userId: former, categoryId, following: true, version: 1 });
    await project({ userId: former, categoryId, following: false, version: 2 });

    expect(await lookup.isFollowing({ userId: follower, categoryId })).toBe(true);
    expect(await lookup.isFollowing({ userId: former, categoryId })).toBe(false);
    expect(await lookup.isFollowing({ userId: randomUUID(), categoryId })).toBe(false);
    expect(await lookup.isFollowing({ userId: follower, categoryId: randomUUID() })).toBe(false);
  });
});

describe("reconstruction du suivi depuis l'outbox de channel (ADR 0049 §6, ADR 0041)", () => {
  it("redonne les paires et le compteur que le consommateur a construits", async () => {
    const categoryId = randomUUID();
    const follower = randomUUID();
    const former = randomUUID();
    const occurredAt = new Date();
    const published = [
      { userId: follower, name: "channel.category.followed", version: 1 },
      { userId: former, name: "channel.category.followed", version: 1 },
      { userId: former, name: "channel.category.unfollowed", version: 2 },
    ].map(({ userId, name, version }) => ({
      id: randomUUID(),
      name,
      version: 1,
      payload:
        name === "channel.category.followed"
          ? { userId, categoryId, followedAt: occurredAt.toISOString(), version }
          : { userId, categoryId, reason: "unfollowed", version },
      occurredAt,
      publishedAt: occurredAt,
    }));
    await channelDb.channelOutbox.createMany({ data: published });
    await project({ userId: randomUUID(), categoryId, following: true, version: 1 });

    await rebuildDiscoveryProjection({
      pool: outboxPool,
      prisma: createContextClient({ context: "discovery", env: process.env }),
    });

    expect(await pairOf(follower, categoryId)).toEqual({ following: true, version: 1 });
    expect(await pairOf(former, categoryId)).toEqual({ following: false, version: 2 });
    expect(await followerCountOf(categoryId)).toBe(1);
  });
});
