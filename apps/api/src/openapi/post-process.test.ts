import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  componentSchema,
  openResponseRoots,
  stripOutputSuffix,
  withComponent,
  withDefaultProblem,
} from "./post-process.ts";
import { responseDto } from "./response-dto.ts";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const jsonResponse = (schema: unknown) => ({
  description: "",
  content: { "application/json": { schema } },
});

const documentWith = (root: Record<string, unknown>, status = "200") => ({
  paths: { "/v1/lives": { get: { responses: { [status]: jsonResponse(ref("LiveDto")) } } } },
  components: { schemas: { LiveDto: root, Other: { type: "object" } } },
});

const PROBLEM_RESPONSE = {
  description: "Erreur au format RFC 9457",
  content: { "application/problem+json": { schema: ref("Problem") } },
};

describe("stripOutputSuffix", () => {
  it("renomme les schémas de sortie et leurs références", () => {
    expect(
      stripOutputSuffix({
        paths: {
          "/v1/lives": { get: { responses: { "200": jsonResponse(ref("LiveDto_Output")) } } },
        },
        components: {
          schemas: {
            Uuid_Output: { type: "string" },
            LiveDto_Output: { type: "object", properties: { id: ref("Uuid_Output") } },
          },
        },
      }),
    ).toEqual({
      paths: { "/v1/lives": { get: { responses: { "200": jsonResponse(ref("LiveDto")) } } } },
      components: {
        schemas: {
          Uuid: { type: "string" },
          LiveDto: { type: "object", properties: { id: ref("Uuid") } },
        },
      },
    });
  });

  it("garde les schémas d'entrée et les noms qui contiennent le mot ailleurs", () => {
    const document = {
      components: { schemas: { StartLiveDto_Input: {}, OutputFormat: {}, Problem: {} } },
    };

    expect(stripOutputSuffix(document)).toEqual(document);
  });

  it("renomme aussi une référence dans un tableau de schémas", () => {
    expect(stripOutputSuffix({ allOf: [ref("Live_Output")] })).toEqual({ allOf: [ref("Live")] });
  });

  it("ne renomme qu'une vraie référence, pas un texte qui lui ressemble", () => {
    const document = {
      description: "#/components/schemas/Live_Output",
      properties: { $ref: { type: "string" } },
    };

    expect(stripOutputSuffix(document)).toEqual(document);
  });

  it("garde une référence externe intacte", () => {
    const document = { a: { $ref: "https://example.com/schemas/Live_Output" } };

    expect(stripOutputSuffix(document)).toEqual(document);
  });
});

describe("openResponseRoots", () => {
  it.each(["201", "2XX"])("rouvre aussi la racine d'une réponse %s", (status) => {
    expect(openResponseRoots(documentWith({ type: "object" }, status))).toMatchObject({
      components: { schemas: { LiveDto: { additionalProperties: {} } } },
    });
  });

  it("garde les autres sections des composants", () => {
    expect(
      openResponseRoots({
        ...documentWith({ type: "object" }),
        components: { schemas: { LiveDto: { type: "object" } }, securitySchemes: { bearer: {} } },
      }),
    ).toMatchObject({ components: { securitySchemes: { bearer: {} } } });
  });

  it("rouvre la racine d'un schéma de réponse 2xx", () => {
    const opened = openResponseRoots(documentWith({ type: "object", properties: {} }));

    expect(opened).toMatchObject({
      components: { schemas: { LiveDto: { additionalProperties: {} } } },
    });
  });

  it("ne touche ni un schéma qui n'est pas une réponse, ni une racine déjà ouverte", () => {
    const opened = openResponseRoots(
      documentWith({ type: "object", additionalProperties: { type: "string" } }),
    );

    expect(opened).toMatchObject({
      components: {
        schemas: {
          LiveDto: { additionalProperties: { type: "string" } },
          Other: { type: "object" },
        },
      },
    });
    expect(JSON.stringify(opened)).not.toContain('"Other":{"type":"object","additionalProperties"');
  });

  it.each(["400", "default"])("ne rouvre pas un schéma de réponse %s", (status) => {
    expect(openResponseRoots(documentWith({ type: "object" }, status))).toMatchObject({
      components: { schemas: { LiveDto: { type: "object" } } },
    });
    expect(
      JSON.stringify(openResponseRoots(documentWith({ type: "object" }, status))),
    ).not.toContain("additionalProperties");
  });

  it("ne rouvre que les objets", () => {
    expect(
      JSON.stringify(openResponseRoots(documentWith({ type: "array", items: {} }))),
    ).not.toContain("additionalProperties");
  });

  it("ignore une réponse sans contenu JSON ou sans référence", () => {
    const document = {
      paths: {
        "/v1/a": { get: { responses: { "204": { description: "" } } } },
        "/v1/b": { get: { responses: { "200": jsonResponse({ type: "object" }) } } },
      },
      components: { schemas: {} },
    };

    expect(openResponseRoots(document)).toEqual(document);
  });

  it("ne modifie pas le document reçu", () => {
    const document = documentWith({ type: "object" });

    openResponseRoots(document);

    expect(document.components.schemas.LiveDto).toEqual({ type: "object" });
  });
});

describe("chemins absents ou inattendus", () => {
  it.each([
    ["sans chemins", { components: { schemas: { LiveDto: { type: "object" } } } }],
    ["avec un chemin vide", { paths: { "/v1/x": null }, components: { schemas: {} } }],
    ["sans composants", { paths: {} }],
  ])("laisse intact un document %s", (_name, document) => {
    expect(openResponseRoots(document)).toEqual(document);
    expect(stripOutputSuffix(document)).toEqual(document);
    expect(withDefaultProblem(document)).toEqual(document);
  });
});

describe("withDefaultProblem", () => {
  it("ajoute Problem en réponse par défaut de chaque opération", () => {
    expect(
      withDefaultProblem({
        paths: {
          "/v1/lives": {
            get: { responses: { "200": jsonResponse(ref("LiveDto")) } },
            post: { responses: { "201": jsonResponse(ref("LiveDto")) } },
          },
        },
      }),
    ).toEqual({
      paths: {
        "/v1/lives": {
          get: { responses: { "200": jsonResponse(ref("LiveDto")), default: PROBLEM_RESPONSE } },
          post: { responses: { "201": jsonResponse(ref("LiveDto")), default: PROBLEM_RESPONSE } },
        },
      },
    });
  });

  it.each(["get", "put", "post", "delete", "options", "head", "patch", "trace"])(
    "traite %s comme une opération",
    (method) => {
      expect(withDefaultProblem({ paths: { "/v1/x": { [method]: {} } } })).toEqual({
        paths: { "/v1/x": { [method]: { responses: { default: PROBLEM_RESPONSE } } } },
      });
    },
  );

  it("ajoute la réponse par défaut à une opération qui n'en déclare aucune", () => {
    expect(withDefaultProblem({ paths: { "/v1/lives": { get: {} } } })).toEqual({
      paths: { "/v1/lives": { get: { responses: { default: PROBLEM_RESPONSE } } } },
    });
  });

  it("ne touche pas ce qui n'est pas une opération", () => {
    const document = {
      paths: {
        "/v1/lives/{id}": {
          parameters: [{ name: "id" }],
          summary: "Un live",
          "x-owner": { team: "video" },
        },
      },
    };

    expect(withDefaultProblem(document)).toEqual(document);
  });
});

describe("withComponent", () => {
  it("ajoute un schéma aux composants existants", () => {
    expect(
      withComponent({ openapi: "3.1.0", components: { schemas: { A: {} } } }, "Problem", {
        type: "object",
      }),
    ).toEqual({
      openapi: "3.1.0",
      components: { schemas: { A: {}, Problem: { type: "object" } } },
    });
  });

  it("crée les composants d'un document qui n'en a pas", () => {
    expect(withComponent({ openapi: "3.1.0" }, "Problem", { type: "object" })).toEqual({
      openapi: "3.1.0",
      components: { schemas: { Problem: { type: "object" } } },
    });
  });

  it("garde les autres sections des composants", () => {
    expect(
      withComponent({ components: { securitySchemes: { bearer: {} } } }, "Problem", {}),
    ).toEqual({ components: { securitySchemes: { bearer: {} }, schemas: { Problem: {} } } });
  });
});

describe("componentSchema", () => {
  it("donne la définition JSON Schema d'un schéma nommé", () => {
    expect(
      componentSchema("Tag", z.looseObject({ label: z.string() }).meta({ id: "Tag" })),
    ).toEqual({
      type: "object",
      properties: { label: { type: "string" } },
      required: ["label"],
      additionalProperties: {},
    });
  });

  it("échoue sur un schéma qui ne porte pas ce nom", () => {
    expect(() => componentSchema("Tag", z.looseObject({ label: z.string() }))).toThrow(
      "Schéma nommé introuvable : Tag",
    );
  });
});

describe("responseDto", () => {
  it("crée un DTO d'une réponse conforme", () => {
    const Live = z.looseObject({ slug: z.string() });

    expect(responseDto(Live).schema).toBe(Live);
  });

  it("refuse dès sa définition une réponse qui viole les conventions", () => {
    expect(() => responseDto(z.object({ state: z.enum(["live"]) }))).toThrow(
      [
        "closed-object ResponseDto : un objet de réponse s'écrit z.looseObject (ADR 0024 §2)",
        "bare-enum ResponseDto.state : un enum de réponse passe par openEnum (ADR 0024 §3)",
      ].join("\n"),
    );
  });
});
