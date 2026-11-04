import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { createContextClient } from "@repo/db";

import {
  type CategoryName,
  type CategorySlug,
  parseCategoryName,
  parseCategorySlug,
} from "./domain/category.ts";
import { prismaCategoryCatalog } from "./infrastructure/prisma-category-catalog.ts";

const NOW = new Date("2026-11-04T12:00:00.000Z");

const prisma = createContextClient({ context: "channel", env: process.env });
const catalog = prismaCategoryCatalog(prisma);

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
      value: { id: categoryId, slug, name: "Just Chatting", status: "active" },
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
});
