import { Body, Controller, Get, Post } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { createZodDto, ZodResponse } from "nestjs-zod";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { openEnum, Uuid } from "@repo/contracts";

import { configureApp } from "../platform/configure-app.ts";
import { PlatformModule } from "../platform/platform.module.ts";
import { buildOpenApiDocument } from "./build-document.ts";
import { responseDto } from "./response-dto.ts";

const LIVE_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";

const Live = z.looseObject({
  id: Uuid,
  state: openEnum(["live", "ended"]),
  channel: z
    .looseObject({ slug: z.string(), title: z.string().nullable() })
    .meta({ id: "LiveChannel" }),
});

class LiveDto extends responseDto(Live) {}

class StartLiveDto extends createZodDto(z.object({ title: z.string().min(3) })) {}

@Controller("lives")
class LivesController {
  @Get("current")
  @ZodResponse({ status: 200, type: LiveDto })
  current() {
    return { id: LIVE_ID, state: "live", channel: { slug: "streamer", title: null } };
  }

  @Get("broken")
  @ZodResponse({ status: 200, type: LiveDto })
  broken() {
    return { id: "pas-un-uuid", state: "live", channel: { slug: "streamer", title: null } };
  }

  @Post()
  @ZodResponse({ status: 201, type: LiveDto })
  start(@Body() body: StartLiveDto) {
    return { id: LIVE_ID, state: "live", channel: { slug: "streamer", title: body.title } };
  }
}

const startApp = async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [PlatformModule.register({ schemaVersionCheck: async () => {}, logSink: () => {} })],
    controllers: [LivesController],
  }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.init();
  return app;
};

type JsonObject = Record<string, unknown>;

const at = (value: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>(
    (current, key) =>
      typeof current === "object" && current !== null ? (current as JsonObject)[key] : undefined,
    value,
  );

const documentOf = async () => {
  const app = await startApp();
  try {
    return buildOpenApiDocument(app);
  } finally {
    await app.close();
  }
};

describe("document OpenAPI", () => {
  it("est un document 3.1, aux chemins préfixés par /v1, sans les sondes", async () => {
    const document = await documentOf();

    expect(at(document, "openapi")).toBe("3.1.0");
    expect(at(document, "info")).toMatchObject({ title: "Twitch API", version: "1" });
    expect(Object.keys(at(document, "paths") as JsonObject).toSorted()).toEqual([
      "/v1/lives",
      "/v1/lives/broken",
      "/v1/lives/current",
    ]);
  });

  it("déclare des réponses ouvertes, qui tolèrent un champ ajouté", async () => {
    const document = await documentOf();
    const schemas = at(document, "components", "schemas") as JsonObject;
    expect(Object.keys(schemas).toSorted()).toEqual([
      "LiveChannel",
      "LiveDto",
      "Problem",
      "StartLiveDto",
      "Uuid",
    ]);
    expect(at(schemas, "LiveDto", "additionalProperties")).toEqual({});
    expect(at(schemas, "LiveChannel", "additionalProperties")).toEqual({});
    expect(at(schemas, "Problem", "additionalProperties")).toEqual({});
  });

  it("écrit un champ nullable en type liste, sans anyOf", async () => {
    const document = await documentOf();

    expect(at(document, "components", "schemas", "LiveChannel", "properties", "title")).toEqual({
      type: ["string", "null"],
    });
    expect(JSON.stringify(document)).not.toMatch(/"anyOf":\[[^\]]*"type":"null"/);
  });

  it("publie Problem sous son nom, en réponse par défaut de chaque opération", async () => {
    const document = await documentOf();

    expect(at(document, "components", "schemas", "Problem", "properties", "status")).toMatchObject({
      type: "integer",
    });
    expect(at(document, "paths", "/v1/lives", "post", "responses", "default")).toEqual({
      description: "Erreur au format RFC 9457",
      content: {
        "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } },
      },
    });
    expect(at(document, "paths", "/v1/lives/current", "get", "responses", "200")).toBeDefined();
  });

  it("est identique d'une génération à l'autre", async () => {
    expect(JSON.stringify(await documentOf())).toBe(JSON.stringify(await documentOf()));
  });
});

const withApp = async (run: (url: string) => Promise<void>) => {
  const app = await startApp();
  await app.listen(0, "127.0.0.1");
  try {
    await run(await app.getUrl());
  } finally {
    await app.close();
  }
};

describe("validation des entrées et des sorties", () => {
  it("refuse un corps invalide en 400, avec les chemins fautifs", async () => {
    await withApp(async (url) => {
      const response = await fetch(`${url}/v1/lives`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "a", extra: true }),
      });

      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toMatch(/^application\/problem\+json/);
      expect(await response.json()).toMatchObject({
        title: "Requête invalide",
        errors: expect.arrayContaining([expect.objectContaining({ path: "title" })]),
      });
    });
  });

  it("accepte un corps valide et renvoie une réponse conforme", async () => {
    await withApp(async (url) => {
      const response = await fetch(`${url}/v1/lives`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Speedrun" }),
      });

      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({ channel: { title: "Speedrun" } });
    });
  });

  it("refuse en 500 une réponse qui ne respecte pas son schéma", async () => {
    await withApp(async (url) => {
      const response = await fetch(`${url}/v1/lives/broken`);
      const text = await response.text();

      expect(response.status).toBe(500);
      expect(text).not.toContain("pas-un-uuid");
    });
  });
});
