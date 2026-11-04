import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";

import { afterAll, describe, expect, it } from "vitest";

import { createContextClient } from "@repo/db";
import { err, ok } from "@repo/result";

import { followCategory, unfollowCategory } from "./application/category-follow.ts";
import {
  type CategoryName,
  type CategorySlug,
  parseCategoryName,
  parseCategorySlug,
} from "./domain/category.ts";
import { prismaCategoryCatalog } from "./infrastructure/prisma-category-catalog.ts";
import { prismaCategoryFollows } from "./infrastructure/prisma-category-follows.ts";

const CREATED_AT = new Date("2026-11-04T12:00:00.000Z");
const FIRST_FOLLOW_AT = new Date("2026-11-04T12:01:00.000Z");
const LATER = new Date("2026-11-04T12:05:00.000Z");

const prisma = createContextClient({ context: "channel", env: process.env });
const catalog = prismaCategoryCatalog(prisma);
const follows = prismaCategoryFollows(prisma);

afterAll(async () => {
  await prisma.$disconnect();
});

const slugOf = (raw: string): CategorySlug => {
  const parsed = parseCategorySlug(raw);
  if (!parsed.ok) {
    throw new Error(`slug de test invalide : ${raw}`);
  }
  return parsed.value;
};

const nameOf = (raw: string): CategoryName => {
  const parsed = parseCategoryName(raw);
  if (!parsed.ok) {
    throw new Error(`nom de test invalide : ${raw}`);
  }
  return parsed.value;
};

const seedCategory = async () => {
  const slug = slugOf(`test-${randomUUID().slice(0, 8)}`);
  const created = await catalog.create({
    categoryId: randomUUID(),
    slug,
    name: nameOf(`Test ${slug}`),
    outboxEventId: randomUUID(),
    occurredAt: CREATED_AT,
  });
  if (!created.ok) {
    throw new Error(`catégorie de test non créée : ${slug}`);
  }
  return created.value;
};

const at = (now: Date) => {
  const eventIds: string[] = [];
  const dependencies = {
    follows,
    newId: () => {
      const id = randomUUID();
      eventIds.push(id);
      return id;
    },
    now: () => now,
  };
  return {
    follow: followCategory(dependencies),
    unfollow: unfollowCategory(dependencies),
    eventIds,
  };
};

const pairOf = (userId: string, categoryId: string) =>
  prisma.channelCategoryFollow.findUnique({
    where: { userId_categoryId: { userId, categoryId } },
    select: { state: true, followedAt: true, version: true, endedReason: true },
  });

const outboxEvents = (ids: readonly string[]) =>
  prisma.channelOutbox.findMany({
    where: { id: { in: [...ids] } },
    select: { name: true, version: true, payload: true, occurredAt: true },
    take: ids.length,
  });

describe("suivi d'une catégorie dans channel (ADR 0049)", () => {
  it("ouvre le suivi à la version 1, avec channel.category.followed dans l'outbox", async () => {
    const category = await seedCategory();
    const userId = randomUUID();
    const { follow, eventIds } = at(FIRST_FOLLOW_AT);

    expect(await follow({ userId, slug: category.slug })).toEqual(ok(undefined));

    expect(await pairOf(userId, category.id)).toEqual({
      state: "following",
      followedAt: FIRST_FOLLOW_AT,
      version: 1,
      endedReason: null,
    });
    expect(await outboxEvents(eventIds)).toEqual([
      {
        name: "channel.category.followed",
        version: 1,
        payload: {
          userId,
          categoryId: category.id,
          followedAt: FIRST_FOLLOW_AT.toISOString(),
          version: 1,
        },
        occurredAt: FIRST_FOLLOW_AT,
      },
    ]);
  });

  it("ne change rien et ne publie rien quand la catégorie est déjà suivie", async () => {
    const category = await seedCategory();
    const userId = randomUUID();
    await at(FIRST_FOLLOW_AT).follow({ userId, slug: category.slug });
    const again = at(LATER);

    expect(await again.follow({ userId, slug: category.slug })).toEqual(ok(undefined));

    expect(await pairOf(userId, category.id)).toMatchObject({
      followedAt: FIRST_FOLLOW_AT,
      version: 1,
    });
    expect(await outboxEvents(again.eventIds)).toEqual([]);
  });

  it("clôt le suivi à la version suivante, avec channel.category.unfollowed dans l'outbox", async () => {
    const category = await seedCategory();
    const userId = randomUUID();
    await at(FIRST_FOLLOW_AT).follow({ userId, slug: category.slug });
    const { unfollow, eventIds } = at(LATER);

    expect(await unfollow({ userId, slug: category.slug })).toEqual(ok(undefined));

    expect(await pairOf(userId, category.id)).toEqual({
      state: "not_following",
      followedAt: null,
      version: 2,
      endedReason: "unfollowed",
    });
    expect(await outboxEvents(eventIds)).toEqual([
      {
        name: "channel.category.unfollowed",
        version: 1,
        payload: { userId, categoryId: category.id, reason: "unfollowed", version: 2 },
        occurredAt: LATER,
      },
    ]);
  });

  it("ne crée aucune paire et ne publie rien pour quitter une catégorie jamais suivie", async () => {
    const category = await seedCategory();
    const userId = randomUUID();
    const { unfollow, eventIds } = at(LATER);

    expect(await unfollow({ userId, slug: category.slug })).toEqual(ok(undefined));

    expect(await pairOf(userId, category.id)).toBeNull();
    expect(await outboxEvents(eventIds)).toEqual([]);
  });

  it("reprend un suivi clos à la version suivante, suivi depuis maintenant", async () => {
    const category = await seedCategory();
    const userId = randomUUID();
    await at(FIRST_FOLLOW_AT).follow({ userId, slug: category.slug });
    await at(FIRST_FOLLOW_AT).unfollow({ userId, slug: category.slug });

    await at(LATER).follow({ userId, slug: category.slug });

    expect(await pairOf(userId, category.id)).toEqual({
      state: "following",
      followedAt: LATER,
      version: 3,
      endedReason: null,
    });
  });

  it("suit la cible quand le slug est celui d'une catégorie fusionnée, même par deux fusions", async () => {
    const source = await seedCategory();
    const middle = await seedCategory();
    const target = await seedCategory();
    await catalog.merge({
      sourceId: source.id,
      targetId: middle.id,
      outboxEventId: randomUUID(),
      occurredAt: CREATED_AT,
    });
    await catalog.merge({
      sourceId: middle.id,
      targetId: target.id,
      outboxEventId: randomUUID(),
      occurredAt: CREATED_AT,
    });
    const userId = randomUUID();

    expect(await at(LATER).follow({ userId, slug: source.slug })).toEqual(ok(undefined));

    expect(await pairOf(userId, target.id)).toMatchObject({ state: "following" });
    expect(await pairOf(userId, source.id)).toBeNull();
  });

  it("rend category_not_found pour une catégorie retirée, sans rien écrire", async () => {
    const category = await seedCategory();
    await catalog.retire({
      categoryId: category.id,
      outboxEventId: randomUUID(),
      occurredAt: CREATED_AT,
    });
    const userId = randomUUID();
    const { follow, eventIds } = at(LATER);

    expect(await follow({ userId, slug: category.slug })).toEqual(err("category_not_found"));

    expect(await pairOf(userId, category.id)).toBeNull();
    expect(await outboxEvents(eventIds)).toEqual([]);
  });

  it("rend category_not_found pour un slug inconnu", async () => {
    expect(
      await at(LATER).unfollow({ userId: randomUUID(), slug: `inconnue-${randomUUID()}` }),
    ).toEqual(err("category_not_found"));
  });

  it("ouvre une seule paire quand plusieurs suivis du même compte arrivent ensemble", async () => {
    const category = await seedCategory();
    const userId = randomUUID();
    const { follow, eventIds } = at(LATER);
    const concurrent = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT 1 FROM "channel"."ChannelCategory" WHERE "id" = ${category.id}::uuid FOR UPDATE
      `;
      const waiting = Array.from({ length: 8 }, () => follow({ userId, slug: category.slug }));
      await setTimeout(200);
      return waiting;
    });

    const outcomes = await Promise.all(concurrent);

    expect(outcomes).toEqual(concurrent.map(() => ok(undefined)));
    expect(await pairOf(userId, category.id)).toMatchObject({ state: "following", version: 1 });
    expect(await outboxEvents(eventIds)).toHaveLength(1);
  });
});
