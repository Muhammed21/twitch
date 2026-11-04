import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { createContextClient } from "@repo/db";

import {
  type CategoryName,
  type CategorySlug,
  parseCategoryName,
  parseCategorySlug,
} from "./domain/category.ts";
import {
  prismaCategoryCatalog,
  prismaCategorySearch,
} from "./infrastructure/prisma-category-catalog.ts";
import { prismaChannelDirectory } from "./infrastructure/prisma-channel-directory.ts";

const NOW = new Date("2026-11-04T12:00:00.000Z");

const prisma = createContextClient({ context: "channel", env: process.env });
const catalog = prismaCategoryCatalog(prisma);
const directory = prismaChannelDirectory(prisma);
const search = prismaCategorySearch(prisma);

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
  const categoryId = randomUUID();
  const slug = slugOf(`test-${randomUUID().slice(0, 8)}`);
  const created = await catalog.create({
    categoryId,
    slug,
    name: nameOf(`Test ${slug}`),
    outboxEventId: randomUUID(),
    occurredAt: NOW,
  });
  if (!created.ok) {
    throw new Error(`catégorie de test non créée : ${slug}`);
  }
  return created.value;
};

const seedChannelIn = async (categoryId: string | null) => {
  const id = randomUUID();
  await prisma.channel.create({
    data: { id, ownerId: randomUUID(), slug: `test_${id.slice(0, 8)}`, categoryId },
  });
  return id;
};

const outboxEvent = (id: string) => prisma.channelOutbox.findUnique({ where: { id } });

describe("catalogue des catégories dans channel (ADR 0045)", () => {
  it("crée une catégorie active, avec channel.category.created dans l'outbox", async () => {
    const categoryId = randomUUID();
    const outboxEventId = randomUUID();
    const slug = slugOf(`test-${randomUUID().slice(0, 8)}`);

    const created = await catalog.create({
      categoryId,
      slug,
      name: nameOf("Just Chatting"),
      outboxEventId,
      occurredAt: NOW,
    });

    expect(created).toEqual({
      ok: true,
      value: { id: categoryId, slug, name: "Just Chatting", status: "active", imageKey: null },
    });
    expect(
      await prisma.channelCategory.findUnique({
        where: { slug },
        select: { id: true, slug: true, name: true, status: true },
      }),
    ).toEqual({
      id: categoryId,
      slug,
      name: "Just Chatting",
      status: "active",
    });
    expect(await outboxEvent(outboxEventId)).toMatchObject({
      name: "channel.category.created",
      version: 1,
      payload: { categoryId, slug, name: "Just Chatting" },
    });
  });

  it("refuse un slug déjà pris, sans event", async () => {
    const existing = await seedCategory();
    const outboxEventId = randomUUID();

    const created = await catalog.create({
      categoryId: randomUUID(),
      slug: slugOf(existing.slug),
      name: nameOf("Doublon"),
      outboxEventId,
      occurredAt: NOW,
    });

    expect(created).toEqual({ ok: false, error: "slug_taken" });
    expect(await outboxEvent(outboxEventId)).toBeNull();
  });

  it("fusionne : les chaînes passent sur la cible, la source est marquée fusionnée", async () => {
    const source = await seedCategory();
    const target = await seedCategory();
    const channelId = await seedChannelIn(source.id);
    const outboxEventId = randomUUID();

    const merged = await catalog.merge({
      sourceId: source.id,
      targetId: target.id,
      outboxEventId,
      occurredAt: NOW,
    });

    expect(merged).toEqual({ ok: true, value: target });
    expect(await prisma.channel.findUnique({ where: { id: channelId } })).toMatchObject({
      categoryId: target.id,
    });
    expect(await prisma.channelCategory.findUnique({ where: { id: source.id } })).toMatchObject({
      status: "merged",
      mergedIntoId: target.id,
    });
    expect(await outboxEvent(outboxEventId)).toMatchObject({
      name: "channel.category.merged",
      version: 1,
      payload: { sourceCategoryId: source.id, targetCategoryId: target.id },
    });
  });

  it("refuse de fusionner vers une catégorie qui n'est plus active", async () => {
    const source = await seedCategory();
    const merged = await seedCategory();
    const target = await seedCategory();
    await catalog.merge({
      sourceId: merged.id,
      targetId: target.id,
      outboxEventId: randomUUID(),
      occurredAt: NOW,
    });
    const channelId = await seedChannelIn(source.id);

    const outcome = await catalog.merge({
      sourceId: source.id,
      targetId: merged.id,
      outboxEventId: randomUUID(),
      occurredAt: NOW,
    });

    expect(outcome).toEqual({ ok: false, error: "invalid_merge" });
    expect(await prisma.channel.findUnique({ where: { id: channelId } })).toMatchObject({
      categoryId: source.id,
    });
  });

  it("refuse de retirer une catégorie qu'une chaîne utilise", async () => {
    const category = await seedCategory();
    await seedChannelIn(category.id);

    const outcome = await catalog.retire({
      categoryId: category.id,
      outboxEventId: randomUUID(),
      occurredAt: NOW,
    });

    expect(outcome).toEqual({ ok: false, error: "category_in_use" });
    expect(await catalog.findBySlug(category.slug)).toMatchObject({ status: "active" });
  });

  it("retire une catégorie inutilisée, avec channel.category.retired, une seule fois", async () => {
    const category = await seedCategory();
    const outboxEventId = randomUUID();

    const retired = await catalog.retire({
      categoryId: category.id,
      outboxEventId,
      occurredAt: NOW,
    });
    const again = await catalog.retire({
      categoryId: category.id,
      outboxEventId: randomUUID(),
      occurredAt: NOW,
    });

    expect(retired).toEqual({ ok: true, value: { ...category, status: "retired" } });
    expect(again).toEqual({ ok: false, error: "category_inactive" });
    expect(await outboxEvent(outboxEventId)).toMatchObject({
      name: "channel.category.retired",
      version: 1,
      payload: { categoryId: category.id },
    });
  });

  it("pose la pochette d'une catégorie active, avec channel.category.updated, rend celle qu'elle remplace, et la refuse une fois retirée", async () => {
    const category = await seedCategory();
    const imageKey = `images/category/${randomUUID()}.webp`;
    const outboxEventId = randomUUID();

    const changed = await catalog.changeImage({
      categoryId: category.id,
      imageKey,
      outboxEventId,
      occurredAt: NOW,
    });
    const replacement = `images/category/${randomUUID()}.webp`;
    const replaced = await catalog.changeImage({
      categoryId: category.id,
      imageKey: replacement,
      outboxEventId: randomUUID(),
      occurredAt: NOW,
    });
    await catalog.retire({ categoryId: category.id, outboxEventId: randomUUID(), occurredAt: NOW });
    const afterRetire = await catalog.changeImage({
      categoryId: category.id,
      imageKey,
      outboxEventId: randomUUID(),
      occurredAt: NOW,
    });

    expect(changed).toEqual({
      ok: true,
      value: { category: { ...category, imageKey }, replacedImageKey: null },
    });
    expect(replaced).toEqual({
      ok: true,
      value: { category: { ...category, imageKey: replacement }, replacedImageKey: imageKey },
    });
    expect(afterRetire).toEqual({ ok: false, error: "category_inactive" });
    expect(await outboxEvent(outboxEventId)).toMatchObject({
      name: "channel.category.updated",
      version: 1,
      payload: { categoryId: category.id, name: category.name, imageKey },
    });
  });
});

describe("catégorie posée sur une chaîne (ADR 0045, §5)", () => {
  it("pose une catégorie active, avec l'état complet dans channel.metadata.updated", async () => {
    const category = await seedCategory();
    const channelId = await seedChannelIn(null);
    const outboxEventId = randomUUID();

    const outcome = await directory.updateMetadata({
      channelId,
      categoryId: category.id,
      outboxEventId,
      occurredAt: NOW,
    });

    expect(outcome).toMatchObject({
      ok: true,
      value: { id: channelId, category: { id: category.id, slug: category.slug } },
    });
    expect(await outboxEvent(outboxEventId)).toMatchObject({
      name: "channel.metadata.updated",
      payload: { channelId, title: "", categoryId: category.id },
    });
  });

  it("refuse une catégorie retirée, sans event", async () => {
    const category = await seedCategory();
    await catalog.retire({ categoryId: category.id, outboxEventId: randomUUID(), occurredAt: NOW });
    const channelId = await seedChannelIn(null);
    const outboxEventId = randomUUID();

    const outcome = await directory.updateMetadata({
      channelId,
      categoryId: category.id,
      outboxEventId,
      occurredAt: NOW,
    });

    expect(outcome).toEqual({ ok: false, error: "category_unavailable" });
    expect(await outboxEvent(outboxEventId)).toBeNull();
  });

  it("retire la catégorie d'une chaîne", async () => {
    const category = await seedCategory();
    const channelId = await seedChannelIn(category.id);
    const outboxEventId = randomUUID();

    const outcome = await directory.updateMetadata({
      channelId,
      categoryId: null,
      outboxEventId,
      occurredAt: NOW,
    });

    expect(outcome).toMatchObject({ ok: true, value: { id: channelId, category: null } });
    expect(await outboxEvent(outboxEventId)).toMatchObject({ payload: { categoryId: null } });
  });
});

describe("recherche dans le catalogue (ADR 0045, §5)", () => {
  it("trouve les catégories actives dont le nom contient le texte, sans tenir compte de la casse, avec leur pochette", async () => {
    const active = await seedCategory();
    const covered = await seedCategory();
    const imageKey = `images/category/${randomUUID()}.webp`;
    await catalog.changeImage({
      categoryId: covered.id,
      imageKey,
      outboxEventId: randomUUID(),
      occurredAt: NOW,
    });
    const retired = await seedCategory();
    await catalog.retire({ categoryId: retired.id, outboxEventId: randomUUID(), occurredAt: NOW });

    const found = await search.search({ nameContains: active.slug.toUpperCase(), limit: 10 });
    const notFound = await search.search({ nameContains: retired.slug, limit: 10 });

    const foundCovered = await search.search({ nameContains: covered.slug, limit: 10 });

    expect(found).toEqual([
      { id: active.id, slug: active.slug, name: active.name, imageKey: null },
    ]);
    expect(foundCovered).toEqual([
      { id: covered.id, slug: covered.slug, name: covered.name, imageKey },
    ]);
    expect(notFound).toEqual([]);
  });
});
