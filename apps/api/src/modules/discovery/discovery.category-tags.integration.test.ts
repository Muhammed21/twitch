import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { responses } from "@repo/contracts";
import { createContextClient } from "@repo/db";

import { createApp } from "../../create-app.ts";
import { prismaActiveCategoryTags } from "./infrastructure/prisma-category-tags.ts";

const discovery = createContextClient({ context: "discovery", env: process.env });
const reader = prismaActiveCategoryTags(discovery);

afterAll(async () => {
  await discovery.$disconnect();
});

const uniqueTag = (label: string) => `${label} ${randomUUID().slice(0, 8)}`;

const seedCategory = ({
  tags,
  status = "active",
  slug = `tags-${randomUUID().slice(0, 8)}`,
}: {
  tags: readonly string[];
  status?: "active" | "merged" | "retired";
  slug?: string | null;
}) =>
  discovery.discoveryCategoryView.create({
    data: { categoryId: randomUUID(), slug, name: "Tags", status, tags: [...tags] },
  });

const tagListsWith = async (tag: string) =>
  (await reader.tagsOfActiveCategories()).filter((tags) => tags.includes(tag));

describe("tags des catégories actives lus dans discovery (ADR 0050, ADR 0051)", () => {
  it("rend les tags de chaque catégorie active, dans leur casse d'affichage", async () => {
    const shared = uniqueTag("FPS");
    await seedCategory({ tags: [shared, "Shooter"] });
    await seedCategory({ tags: [shared] });

    expect(await tagListsWith(shared)).toEqual(
      expect.arrayContaining([[shared, "Shooter"], [shared]]),
    );
    expect(await tagListsWith(shared)).toHaveLength(2);
  });

  it.each([
    ["retirée", { status: "retired" }],
    ["fusionnée", { status: "merged" }],
    ["pas encore créée dans discovery", { slug: null }],
  ] as const)("ignore une catégorie %s", async (_name, variant) => {
    const tag = uniqueTag("Ancien");
    await seedCategory({ tags: [tag], ...variant });

    expect(await tagListsWith(tag)).toEqual([]);
  });

  it("sert GET /v1/tags avec le tag partagé une fois, et sans le tag d'une catégorie retirée", async () => {
    const shared = uniqueTag("Shooter");
    const retired = uniqueTag("Ancien");
    await seedCategory({ tags: [shared] });
    await seedCategory({ tags: [shared.toUpperCase()] });
    await seedCategory({ tags: [retired], status: "retired" });
    const { app } = await createApp({ env: process.env, logSink: () => {} });
    await app.listen(0, "127.0.0.1");

    try {
      const response = await fetch(`${await app.getUrl()}/v1/tags`);
      const { items } = responses.CategoryTagList.parse(await response.json());

      expect(response.status).toBe(200);
      expect(items).toContainEqual({ name: shared.toUpperCase(), categoryCount: 2 });
      expect(JSON.stringify(items)).not.toContain(retired);
    } finally {
      await app.close();
    }
  });
});
