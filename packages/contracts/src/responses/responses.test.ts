import { describe, expect, it } from "vitest";
import { z } from "zod";

import { checkResponseSchema, responses } from "../index.ts";

const makeProblem = (overrides: Record<string, unknown> = {}) => ({
  type: "about:blank",
  title: "Requête invalide",
  status: 400,
  ...overrides,
});

describe("toutes les réponses exportées", () => {
  it.each(Object.entries(responses))(
    "%s respecte les conventions de l'ADR 0024",
    (name, schema) => {
      expect(checkResponseSchema(name, schema)).toEqual([]);
    },
  );

  it.each(Object.entries(responses))("%s est un schéma nommé", (name, schema) => {
    expect(z.globalRegistry.get(schema)?.id).toBe(name);
  });
});

describe("Problem", () => {
  it("décode une erreur complète produite par l'API", () => {
    const problem = makeProblem({
      detail: "Le titre est trop court.",
      instance: "/v1/channels/42",
      correlationId: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
      errors: [{ path: "title", message: "Too small" }],
    });

    expect(responses.Problem.parse(problem)).toEqual(problem);
  });

  it("garde un champ ajouté plus tard par le serveur", () => {
    expect(responses.Problem.parse(makeProblem({ retryAfter: 30 }))).toMatchObject({
      retryAfter: 30,
    });
  });

  it.each([
    ["sans titre", { title: undefined }],
    ["avec un statut décimal", { status: 400.5 }],
    ["avec un statut hors HTTP", { status: 99 }],
    ["avec un statut au-delà de 599", { status: 600 }],
    ["avec une erreur de champ sans chemin", { errors: [{ message: "Too small" }] }],
    ["avec une erreur de champ sans message", { errors: [{ path: "title" }] }],
  ])("refuse une erreur %s", (_name, overrides) => {
    expect(responses.Problem.safeParse(makeProblem(overrides)).success).toBe(false);
  });
});
