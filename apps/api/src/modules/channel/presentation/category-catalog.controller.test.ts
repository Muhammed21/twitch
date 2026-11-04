import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import { rejectingVerifier } from "../../../platform/authentication.ts";
import { configureApp } from "../../../platform/configure-app.ts";
import { PlatformModule } from "../../../platform/platform.module.ts";
import type { ChannelCategoryView } from "../application/channel-queries.ts";
import {
  CategoryCatalogController,
  SEARCH_CATEGORIES,
  type SearchCategories,
} from "./category-catalog.controller.ts";

const JUST_CHATTING: ChannelCategoryView = {
  id: "7c6d5e4f-3a2b-4c1d-8e9f-0a1b2c3d4e5f",
  slug: "just-chatting",
  name: "Just Chatting",
};

const withCatalog = async (
  found: readonly ChannelCategoryView[],
  run: (base: string, queries: (string | undefined)[]) => Promise<void>,
) => {
  const queries: (string | undefined)[] = [];
  const search: SearchCategories = async (query) => {
    queries.push(query);
    return found;
  };
  const moduleRef = await Test.createTestingModule({
    imports: [
      PlatformModule.register({
        schemaVersionCheck: async () => {},
        logSink: () => {},
        accessTokenVerifier: rejectingVerifier,
      }),
    ],
    controllers: [CategoryCatalogController],
    providers: [{ provide: SEARCH_CATEGORIES, useValue: search }],
  }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.listen(0, "127.0.0.1");
  try {
    await run(`${await app.getUrl()}/v1/categories/catalog`, queries);
  } finally {
    await app.close();
  }
};

describe("GET /v1/categories/catalog", () => {
  it("rend les catégories du texte cherché, sans jeton", async () => {
    await withCatalog([JUST_CHATTING], async (base, queries) => {
      const response = await fetch(`${base}?q=just`);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ categories: [JUST_CHATTING] });
      expect(queries).toEqual(["just"]);
    });
  });

  it("rend tout le catalogue sans texte cherché", async () => {
    await withCatalog([], async (base, queries) => {
      const response = await fetch(base);

      expect(await response.json()).toEqual({ categories: [] });
      expect(queries).toEqual([undefined]);
    });
  });

  it("répond 400 pour une recherche donnée deux fois", async () => {
    await withCatalog([], async (base, queries) => {
      const response = await fetch(`${base}?q=a&q=b`);

      expect(response.status).toBe(400);
      expect(queries).toEqual([]);
    });
  });
});
