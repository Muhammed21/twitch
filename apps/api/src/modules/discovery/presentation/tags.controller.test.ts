import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import { responses } from "@repo/contracts";

import { buildOpenApiDocument } from "../../../openapi/build-document.ts";
import { rejectingVerifier } from "../../../platform/authentication.ts";
import { configureApp } from "../../../platform/configure-app.ts";
import { PlatformModule } from "../../../platform/platform.module.ts";
import type { CategoryTagCount } from "../application/category-tags.ts";
import { LIST_CATEGORY_TAGS, TagsController } from "./tags.controller.ts";

const withController = async (
  tags: readonly CategoryTagCount[],
  run: (base: string, document: () => unknown) => Promise<void>,
) => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      PlatformModule.register({
        schemaVersionCheck: async () => {},
        logSink: () => {},
        accessTokenVerifier: rejectingVerifier,
      }),
    ],
    controllers: [TagsController],
    providers: [{ provide: LIST_CATEGORY_TAGS, useValue: async () => tags }],
  }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.listen(0, "127.0.0.1");
  try {
    await run(`${await app.getUrl()}/v1`, () => buildOpenApiDocument(app));
  } finally {
    await app.close();
  }
};

describe("GET /v1/tags (ADR 0050, ADR 0051)", () => {
  it("rend les tags des catégories actives avec leur nombre de catégories, sans jeton", async () => {
    const tags = [
      { name: "Shooter", categoryCount: 2 },
      { name: "FPS", categoryCount: 1 },
    ];
    await withController(tags, async (base) => {
      const response = await fetch(`${base}/tags`);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ items: tags });
    });
  });

  it("rend une liste vide quand aucune catégorie active ne porte de tag", async () => {
    await withController([], async (base) => {
      const response = await fetch(`${base}/tags`);

      expect(response.status).toBe(200);
      expect(responses.CategoryTagList.parse(await response.json())).toEqual({ items: [] });
    });
  });

  it("documente la réponse par le contrat CategoryTagList", async () => {
    await withController([], async (_base, document) => {
      const text = JSON.stringify(document());

      expect(text).toContain('"/v1/tags":{"get":{"operationId":"TagsController_list"');
      expect(text).toContain('"$ref":"#/components/schemas/CategoryTagList"');
    });
  });
});
