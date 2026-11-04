import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import { buildOpenApiDocument } from "../../../openapi/build-document.ts";
import { rejectingVerifier } from "../../../platform/authentication.ts";
import { configureApp } from "../../../platform/configure-app.ts";
import { PlatformModule } from "../../../platform/platform.module.ts";
import type { BrowseCategories, BrowsePage } from "../application/category-audience.ts";
import type { ListCategoryLives } from "../application/category-reads.ts";
import type { ListedLive, LivesPage } from "../application/list-lives.ts";
import {
  BROWSE_CATEGORIES,
  CategoriesController,
  LIST_CATEGORY_LIVES,
} from "./categories.controller.ts";
import { encodeAudienceCursor } from "./category-cursor.ts";
import { encodeLiveCursor } from "./live-cursor.ts";

const CHANNEL_ID = "6f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
const STARTED_AT = new Date("2026-11-04T20:00:00.000Z");

const makeLive = (overrides: Partial<ListedLive> = {}): ListedLive => ({
  channelId: CHANNEL_ID,
  slug: "streamer",
  title: "Speedrun",
  startedAt: STARTED_AT,
  categoryId: null,
  ...overrides,
});

const IRL_LIVE = makeLive({
  categoryId: "1c6f5e4d-3b2a-4019-9f8e-7d6c5b4a3928",
  category: { slug: "irl", name: "IRL" },
  viewerCount: 12,
});

type Calls = {
  categoryLives: Parameters<ListCategoryLives>[0][];
  browse: Parameters<BrowseCategories>[0][];
};

const withControllers = async (
  {
    categoryPage = { items: [], next: undefined },
    found = true,
    browsePage = { items: [], next: undefined },
  }: {
    categoryPage?: LivesPage;
    found?: boolean;
    browsePage?: BrowsePage;
  },
  run: (base: string, calls: Calls, document: () => unknown) => Promise<void>,
) => {
  const calls: Calls = { categoryLives: [], browse: [] };
  const browseCategories: BrowseCategories = async (request) => {
    calls.browse.push(request);
    return browsePage;
  };
  const listCategoryLives: ListCategoryLives = async (request) => {
    calls.categoryLives.push(request);
    return found ? { ok: true, value: categoryPage } : { ok: false, error: "category_not_found" };
  };
  const moduleRef = await Test.createTestingModule({
    imports: [
      PlatformModule.register({
        schemaVersionCheck: async () => {},
        logSink: () => {},
        accessTokenVerifier: rejectingVerifier,
      }),
    ],
    controllers: [CategoriesController],
    providers: [
      { provide: LIST_CATEGORY_LIVES, useValue: listCategoryLives },
      { provide: BROWSE_CATEGORIES, useValue: browseCategories },
    ],
  }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.listen(0, "127.0.0.1");
  try {
    await run(`${await app.getUrl()}/v1`, calls, () => buildOpenApiDocument(app));
  } finally {
    await app.close();
  }
};

const IRL_AUDIENCE = {
  categoryId: "1c6f5e4d-3b2a-4019-9f8e-7d6c5b4a3928",
  slug: "irl",
  name: "IRL",
  liveCount: 2,
  viewerCount: 70,
};

describe("GET /v1/categories", () => {
  it("rend une page de catégories en live, sans jeton, avec le curseur suivant", async () => {
    const next = { viewerCount: 70, liveCount: 2, categoryId: IRL_AUDIENCE.categoryId };
    await withControllers({ browsePage: { items: [IRL_AUDIENCE], next } }, async (base, calls) => {
      const response = await fetch(`${base}/categories`);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        items: [{ slug: "irl", name: "IRL", liveCount: 2, viewerCount: 70 }],
        nextCursor: encodeAudienceCursor(next),
      });
      expect(calls.browse).toEqual([{ after: undefined, limit: 20 }]);
    });
  });

  it("lit la page après le curseur, à la taille demandée, sans curseur sur la dernière", async () => {
    const after = { viewerCount: 0, liveCount: 1, categoryId: IRL_AUDIENCE.categoryId };
    await withControllers({}, async (base, calls) => {
      const response = await fetch(
        `${base}/categories?limit=5&cursor=${encodeAudienceCursor(after)}`,
      );

      expect(await response.json()).toEqual({ items: [] });
      expect(calls.browse).toEqual([{ after, limit: 5 }]);
    });
  });

  it.each([
    ["un curseur illisible", "cursor=abc"],
    [
      "un curseur aux compteurs négatifs",
      `cursor=${encodeAudienceCursor({ viewerCount: -1, liveCount: 1, categoryId: "1c6f5e4d-3b2a-4019-9f8e-7d6c5b4a3928" })}`,
    ],
    [
      "un curseur au-delà d'un entier de la base",
      `cursor=${encodeAudienceCursor({ viewerCount: 2_147_483_648, liveCount: 1, categoryId: "1c6f5e4d-3b2a-4019-9f8e-7d6c5b4a3928" })}`,
    ],
    ["une limite hors bornes", "limit=51"],
  ])("refuse %s", async (_name, query) => {
    await withControllers({}, async (base, calls) => {
      expect((await fetch(`${base}/categories?${query}`)).status).toBe(400);
      expect(calls.browse).toEqual([]);
    });
  });

  it("accepte un curseur au plus grand entier de la base", async () => {
    const after = { viewerCount: 2_147_483_647, liveCount: 1, categoryId: IRL_AUDIENCE.categoryId };
    await withControllers({}, async (base, calls) => {
      await fetch(`${base}/categories?cursor=${encodeAudienceCursor(after)}`);

      expect(calls.browse).toEqual([{ after, limit: 20 }]);
    });
  });

  it("figure dans l'OpenAPI avec BrowseCategoryList", async () => {
    await withControllers({}, async (_base, _calls, document) => {
      const text = JSON.stringify(document());

      expect(text).toContain(
        '"/v1/categories":{"get":{"operationId":"CategoriesController_browse"',
      );
      expect(text).toContain('"$ref":"#/components/schemas/BrowseCategoryList"');
    });
  });
});

describe("GET /v1/categories/{slug}/lives", () => {
  it("rend les lives de la catégorie avec leur catégorie, et le curseur suivant", async () => {
    const next = { startedAt: STARTED_AT, channelId: CHANNEL_ID };
    await withControllers({ categoryPage: { items: [IRL_LIVE], next } }, async (base, calls) => {
      const response = await fetch(`${base}/categories/irl/lives`);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        items: [
          {
            channelId: CHANNEL_ID,
            slug: "streamer",
            title: "Speedrun",
            startedAt: STARTED_AT.toISOString(),
            viewerCount: 12,
            category: { slug: "irl", name: "IRL" },
          },
        ],
        nextCursor: encodeLiveCursor(next),
      });
      expect(calls.categoryLives).toEqual([{ slug: "irl", after: undefined, limit: 20 }]);
    });
  });

  it("lit la page après le curseur, à la taille demandée", async () => {
    const after = { startedAt: STARTED_AT, channelId: CHANNEL_ID };
    await withControllers({}, async (base, calls) => {
      const response = await fetch(
        `${base}/categories/irl/lives?cursor=${encodeLiveCursor(after)}&limit=5`,
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ items: [] });
      expect(calls.categoryLives).toEqual([{ slug: "irl", after, limit: 5 }]);
    });
  });

  it("répond 404 pour une catégorie introuvable", async () => {
    await withControllers({ found: false }, async (base) => {
      const response = await fetch(`${base}/categories/minecraft/lives`);

      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ status: 404, title: "Catégorie introuvable" });
    });
  });

  it.each(["limit=0", "limit=51", "cursor=illisible"])("refuse %s", async (query) => {
    await withControllers({}, async (base, calls) => {
      expect((await fetch(`${base}/categories/irl/lives?${query}`)).status).toBe(400);
      expect(calls.categoryLives).toEqual([]);
    });
  });
});
