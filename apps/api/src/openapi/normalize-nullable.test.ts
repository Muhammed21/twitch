import { describe, expect, it } from "vitest";

import { normalizeNullable } from "./normalize-nullable.ts";

describe("normalizeNullable", () => {
  it("réécrit un anyOf nullable à deux branches en type liste", () => {
    expect(
      normalizeNullable({ anyOf: [{ type: "string", format: "date-time" }, { type: "null" }] }),
    ).toEqual({ type: ["string", "null"], format: "date-time" });
  });

  it("accepte la branche null en premier", () => {
    expect(normalizeNullable({ anyOf: [{ type: "null" }, { type: "integer" }] })).toEqual({
      type: ["integer", "null"],
    });
  });

  it("garde les mots-clés posés à côté de l'anyOf", () => {
    expect(
      normalizeNullable({
        description: "Fin du live",
        anyOf: [{ type: "string" }, { type: "null" }],
      }),
    ).toEqual({ description: "Fin du live", type: ["string", "null"] });
  });

  it("réécrit en profondeur, dans les objets et les tableaux", () => {
    expect(
      normalizeNullable({
        components: {
          schemas: {
            Live: {
              type: "object",
              properties: {
                endedAt: { anyOf: [{ type: "string" }, { type: "null" }] },
                tags: { type: "array", items: { anyOf: [{ type: "string" }, { type: "null" }] } },
              },
            },
          },
        },
      }),
    ).toEqual({
      components: {
        schemas: {
          Live: {
            type: "object",
            properties: {
              endedAt: { type: ["string", "null"] },
              tags: { type: "array", items: { type: ["string", "null"] } },
            },
          },
        },
      },
    });
  });

  it.each([
    ["trois branches", { anyOf: [{ type: "string" }, { type: "integer" }, { type: "null" }] }],
    ["deux branches sans null", { anyOf: [{ type: "string" }, { type: "integer" }] }],
    [
      "une référence nullable",
      { anyOf: [{ $ref: "#/components/schemas/Uuid" }, { type: "null" }] },
    ],
    ["une branche déjà multiple", { anyOf: [{ type: ["string", "integer"] }, { type: "null" }] }],
    [
      "un null qui porte d'autres mots-clés",
      { anyOf: [{ type: "string" }, { type: "null", description: "x" }] },
    ],
    ["deux branches null", { anyOf: [{ type: "null" }, { type: "null" }] }],
    [
      "un null décrit et un null nu",
      { anyOf: [{ type: "null", description: "x" }, { type: "null" }] },
    ],
    [
      "trois branches, null en premier",
      { anyOf: [{ type: "null" }, { type: "string" }, { type: "integer" }] },
    ],
    [
      "trois branches dont deux null",
      { anyOf: [{ type: "string" }, { type: "null" }, { type: "null" }] },
    ],
  ])("laisse intact un anyOf avec %s", (_name, schema) => {
    expect(normalizeNullable(schema)).toEqual(schema);
  });

  it("réécrit aussi dans un tableau de schémas", () => {
    expect(
      normalizeNullable({ allOf: [{ anyOf: [{ type: "string" }, { type: "null" }] }] }),
    ).toEqual({
      allOf: [{ type: ["string", "null"] }],
    });
  });

  it("ne modifie pas le document reçu", () => {
    const document = { anyOf: [{ type: "string" }, { type: "null" }] };

    normalizeNullable(document);

    expect(document).toEqual({ anyOf: [{ type: "string" }, { type: "null" }] });
  });

  it("laisse intactes les valeurs scalaires", () => {
    expect(normalizeNullable({ openapi: "3.1.0", count: 2, flag: true, none: null })).toEqual({
      openapi: "3.1.0",
      count: 2,
      flag: true,
      none: null,
    });
  });
});
