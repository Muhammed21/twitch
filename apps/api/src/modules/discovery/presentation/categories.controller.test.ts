import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import { buildOpenApiDocument } from "../../../openapi/build-document.ts";
import { rejectingVerifier } from "../../../platform/authentication.ts";
import { configureApp } from "../../../platform/configure-app.ts";
import { PlatformModule } from "../../../platform/platform.module.ts";
import type { BrowsedCategory, ListCategoryLives } from "../application/category-reads.ts";
import type { ListedLive, ListLives, LivesPage } from "../application/list-lives.ts";
import {
  BROWSE_CATEGORIES,
  CategoriesController,
  LIST_CATEGORY_LIVES,
} from "./categories.controller.ts";
import { encodeLiveCursor } from "./live-cursor.ts";
import { LIST_LIVES, LivesController } from "./lives.controller.ts";

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
  lives: Parameters<ListLives>[0][];
};

const withControllers = async (
  {
    browsed = [],
    categoryPage = { items: [], next: undefined },
    found = true,
    lives = { items: [], next: undefined },
  }: {
    browsed?: readonly BrowsedCategory[];
    categoryPage?: LivesPage;
    found?: boolean;
    lives?: LivesPage;
  },
  run: (base: string, calls: Calls, document: () => unknown) => Promise<void>,
) => {
  const calls: Calls = { categoryLives: [], lives: [] };
  const listCategoryLives: ListCategoryLives = async (request) => {
    calls.categoryLives.push(request);
    return found ? { ok: true, value: categoryPage } : { ok: false, error: "category_not_found" };
  };
  const listLives: ListLives = async (request) => {
    calls.lives.push(request);
    return lives;
  };
  const moduleRef = await Test.createTestingModule({
    imports: [
      PlatformModule.register({
        schemaVersionCheck: async () => {},
        logSink: () => {},
        accessTokenVerifier: rejectingVerifier,
      }),
    ],
    controllers: [CategoriesController, LivesController],
    providers: [
      { provide: BROWSE_CATEGORIES, useValue: async () => browsed },
      { provide: LIST_CATEGORY_LIVES, useValue: listCategoryLives },
      { provide: LIST_LIVES, useValue: listLives },
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

describe("GET /v1/categories", () => {
  it("rend les catégories en live, sans jeton, sans viewers quand ils manquent", async () => {
    const browsed = [
      { slug: "irl", name: "IRL", liveCount: 2, viewerCount: 70 },
      { slug: "art", name: "Art", liveCount: 1 },
    ];
    await withControllers({ browsed }, async (base) => {
      const response = await fetch(`${base}/categories`);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ items: browsed });
    });
  });

  it("figure dans l'OpenAPI avec BrowseCategoryList", async () => {
    await withControllers({}, async (_base, _calls, document) => {
      expect(JSON.stringify(document())).toContain(
        '"/v1/categories":{"get":{"operationId":"CategoriesController_browse"',
      );
      expect(JSON.stringify(document())).toContain(
        '"$ref":"#/components/schemas/BrowseCategoryList"',
      );
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

describe("GET /v1/lives", () => {
  it("donne à chaque live sa catégorie quand il en a une", async () => {
    await withControllers(
      { lives: { items: [IRL_LIVE, makeLive()], next: undefined } },
      async (base, calls) => {
        const body = await (await fetch(`${base}/lives?limit=3`)).json();

        expect(body).toEqual({
          items: [
            expect.objectContaining({ category: { slug: "irl", name: "IRL" } }),
            {
              channelId: CHANNEL_ID,
              slug: "streamer",
              title: "Speedrun",
              startedAt: STARTED_AT.toISOString(),
            },
          ],
        });
        expect(calls.lives).toEqual([{ after: undefined, limit: 3 }]);
      },
    );
  });
});
