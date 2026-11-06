import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";

import { afterAll, describe, expect, it } from "vitest";

import { createContextClient } from "@repo/db";
import { err, ok } from "@repo/result";

import type { AuditActor } from "../../platform/audit-actor.ts";
import { followCategory, unfollowCategory } from "./application/category-follow.ts";
import {
  type CategoryName,
  type CategorySlug,
  parseCategoryName,
  parseCategorySlug,
} from "./domain/category.ts";
import { prismaCategoryCatalog } from "./infrastructure/prisma-category-catalog.ts";
import { prismaCategoryFollows } from "./infrastructure/prisma-category-follows.ts";

const API_ACTOR: AuditActor = {
  actorId: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
  onBehalfOf: null,
  source: "api",
};
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
    actor: API_ACTOR,
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
      actor: API_ACTOR,
      sourceId: source.id,
      targetId: middle.id,
      outboxEventId: randomUUID(),
      occurredAt: CREATED_AT,
    });
    await catalog.merge({
      actor: API_ACTOR,
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
      actor: API_ACTOR,
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

const MERGED_AT = new Date("2026-11-04T13:00:00.000Z");

const followEventsOf = async (categoryId: string) =>
  (
    await prisma.channelOutbox.findMany({
      where: {
        name: { in: ["channel.category.followed", "channel.category.unfollowed"] },
        payload: { path: ["categoryId"], equals: categoryId },
      },
      select: { name: true, version: true, payload: true, occurredAt: true },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      take: 100,
    })
  ).filter(({ occurredAt }) => occurredAt.getTime() === MERGED_AT.getTime());

const mergeInto = (sourceId: string, targetId: string) =>
  catalog.merge({
    actor: API_ACTOR,
    sourceId,
    targetId,
    outboxEventId: randomUUID(),
    occurredAt: MERGED_AT,
  });

describe("fusion d'une catégorie suivie (ADR 0049 §4)", () => {
  it("passe le suivi de la source sur la cible, avec le followedAt de la source", async () => {
    const source = await seedCategory();
    const target = await seedCategory();
    const userId = randomUUID();
    await at(FIRST_FOLLOW_AT).follow({ userId, slug: source.slug });

    await mergeInto(source.id, target.id);

    expect(await pairOf(userId, target.id)).toEqual({
      state: "following",
      followedAt: FIRST_FOLLOW_AT,
      version: 1,
      endedReason: null,
    });
    expect(await followEventsOf(target.id)).toEqual([
      {
        name: "channel.category.followed",
        version: 1,
        payload: {
          userId,
          categoryId: target.id,
          followedAt: FIRST_FOLLOW_AT.toISOString(),
          version: 1,
        },
        occurredAt: MERGED_AT,
      },
    ]);
  });

  it("clôt le suivi de la source pour la raison category_merged, avec son event", async () => {
    const source = await seedCategory();
    const target = await seedCategory();
    const userId = randomUUID();
    await at(FIRST_FOLLOW_AT).follow({ userId, slug: source.slug });

    await mergeInto(source.id, target.id);

    expect(await pairOf(userId, source.id)).toEqual({
      state: "not_following",
      followedAt: null,
      version: 2,
      endedReason: "category_merged",
    });
    expect(await followEventsOf(source.id)).toEqual([
      {
        name: "channel.category.unfollowed",
        version: 1,
        payload: { userId, categoryId: source.id, reason: "category_merged", version: 2 },
        occurredAt: MERGED_AT,
      },
    ]);
  });

  it("garde intact le suivi de la cible d'un compte qui suivait les deux, sans event", async () => {
    const source = await seedCategory();
    const target = await seedCategory();
    const userId = randomUUID();
    await at(FIRST_FOLLOW_AT).follow({ userId, slug: target.slug });
    await at(LATER).follow({ userId, slug: source.slug });

    await mergeInto(source.id, target.id);

    expect(await pairOf(userId, target.id)).toEqual({
      state: "following",
      followedAt: FIRST_FOLLOW_AT,
      version: 1,
      endedReason: null,
    });
    expect(await followEventsOf(target.id)).toEqual([]);
    expect(await pairOf(userId, source.id)).toMatchObject({ endedReason: "category_merged" });
  });

  it("rouvre à la version suivante la paire cible d'un compte qui l'avait quittée", async () => {
    const source = await seedCategory();
    const target = await seedCategory();
    const userId = randomUUID();
    await at(FIRST_FOLLOW_AT).follow({ userId, slug: target.slug });
    await at(FIRST_FOLLOW_AT).unfollow({ userId, slug: target.slug });
    await at(LATER).follow({ userId, slug: source.slug });

    await mergeInto(source.id, target.id);

    expect(await pairOf(userId, target.id)).toEqual({
      state: "following",
      followedAt: LATER,
      version: 3,
      endedReason: null,
    });
    expect(await followEventsOf(target.id)).toEqual([
      expect.objectContaining({
        name: "channel.category.followed",
        payload: { userId, categoryId: target.id, followedAt: LATER.toISOString(), version: 3 },
      }),
    ]);
  });

  it("ne transfère ni ne republie un suivi de la source déjà clos", async () => {
    const source = await seedCategory();
    const target = await seedCategory();
    const userId = randomUUID();
    await at(FIRST_FOLLOW_AT).follow({ userId, slug: source.slug });
    await at(FIRST_FOLLOW_AT).unfollow({ userId, slug: source.slug });

    await mergeInto(source.id, target.id);

    expect(await pairOf(userId, target.id)).toBeNull();
    expect(await pairOf(userId, source.id)).toMatchObject({
      version: 2,
      endedReason: "unfollowed",
    });
    expect(await followEventsOf(source.id)).toEqual([]);
  });

  it("ne touche pas aux suivis d'une fusion refusée", async () => {
    const source = await seedCategory();
    const retiredTarget = await seedCategory();
    await catalog.retire({
      actor: API_ACTOR,
      categoryId: retiredTarget.id,
      outboxEventId: randomUUID(),
      occurredAt: CREATED_AT,
    });
    const userId = randomUUID();
    await at(FIRST_FOLLOW_AT).follow({ userId, slug: source.slug });

    expect(await mergeInto(source.id, retiredTarget.id)).toEqual(err("invalid_merge"));

    expect(await pairOf(userId, source.id)).toMatchObject({ state: "following", version: 1 });
    expect(await followEventsOf(source.id)).toEqual([]);
  });
});

describe("retrait d'une catégorie suivie (ADR 0049 §5)", () => {
  it("clôt chaque suivi pour la raison category_retired, avec son event", async () => {
    const category = await seedCategory();
    const follower = randomUUID();
    const former = randomUUID();
    await at(FIRST_FOLLOW_AT).follow({ userId: follower, slug: category.slug });
    await at(FIRST_FOLLOW_AT).follow({ userId: former, slug: category.slug });
    await at(FIRST_FOLLOW_AT).unfollow({ userId: former, slug: category.slug });

    await catalog.retire({
      actor: API_ACTOR,
      categoryId: category.id,
      outboxEventId: randomUUID(),
      occurredAt: MERGED_AT,
    });

    expect(await pairOf(follower, category.id)).toEqual({
      state: "not_following",
      followedAt: null,
      version: 2,
      endedReason: "category_retired",
    });
    expect(await pairOf(former, category.id)).toMatchObject({
      version: 2,
      endedReason: "unfollowed",
    });
    expect(await followEventsOf(category.id)).toEqual([
      {
        name: "channel.category.unfollowed",
        version: 1,
        payload: {
          userId: follower,
          categoryId: category.id,
          reason: "category_retired",
          version: 2,
        },
        occurredAt: MERGED_AT,
      },
    ]);
  });

  it("ne touche pas aux suivis d'un retrait refusé", async () => {
    const category = await seedCategory();
    const userId = randomUUID();
    await at(FIRST_FOLLOW_AT).follow({ userId, slug: category.slug });
    await prisma.channel.create({
      data: {
        id: randomUUID(),
        ownerId: randomUUID(),
        slug: `test_${randomUUID().slice(0, 8)}`,
        categoryId: category.id,
      },
    });

    expect(
      await catalog.retire({
        actor: API_ACTOR,
        categoryId: category.id,
        outboxEventId: randomUUID(),
        occurredAt: MERGED_AT,
      }),
    ).toEqual(err("category_in_use"));

    expect(await pairOf(userId, category.id)).toMatchObject({ state: "following", version: 1 });
  });
});
