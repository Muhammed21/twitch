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

describe("Me", () => {
  const makeMe = (overrides: Record<string, unknown> = {}) => ({
    id: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
    name: "Viewer de test",
    email: "viewer@twitch.local",
    ...overrides,
  });

  it("décode le compte de l'utilisateur authentifié", () => {
    expect(responses.Me.parse(makeMe())).toEqual(makeMe());
  });

  it("garde un champ ajouté plus tard par le serveur", () => {
    expect(responses.Me.parse(makeMe({ avatarUrl: "https://cdn/a.png" }))).toMatchObject({
      avatarUrl: "https://cdn/a.png",
    });
  });

  it.each([
    ["un identifiant qui n'est pas un UUID", { id: "FWGDz5f2dSosyWpO6un25VBOMSsnkVjk" }],
    ["sans nom", { name: undefined }],
    ["sans e-mail", { email: undefined }],
  ])("refuse %s", (_name, overrides) => {
    expect(responses.Me.safeParse(makeMe(overrides)).success).toBe(false);
  });
});

const makeChannel = (overrides: Record<string, unknown> = {}) => ({
  id: "9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69",
  slug: "streamer_de_test",
  title: "Speedrun du dimanche",
  ownerId: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
  ...overrides,
});

describe("Channel", () => {
  it("décode une chaîne, son slug, son titre et son propriétaire", () => {
    expect(responses.Channel.parse(makeChannel())).toEqual(makeChannel());
  });

  it("garde un champ ajouté plus tard par le serveur", () => {
    expect(responses.Channel.parse(makeChannel({ isLive: true }))).toMatchObject({
      isLive: true,
    });
  });

  it.each([
    ["avec un identifiant qui n'est pas un UUID", { id: "chaine-1" }],
    ["sans slug", { slug: undefined }],
    ["sans titre", { title: undefined }],
    ["avec un propriétaire qui n'est pas un UUID", { ownerId: "moi" }],
  ])("refuse une chaîne %s", (_name, overrides) => {
    expect(responses.Channel.safeParse(makeChannel(overrides)).success).toBe(false);
  });
});

describe("StreamKey", () => {
  const makeStreamKey = (overrides: Record<string, unknown> = {}) => ({
    streamKey: "sk_live_0123456789abcdef",
    ingestUrl: "rtmp://127.0.0.1:1935/live",
    ...overrides,
  });

  it("décode la clé de stream et l'adresse d'ingest", () => {
    expect(responses.StreamKey.parse(makeStreamKey())).toEqual(makeStreamKey());
  });

  it("garde un champ ajouté plus tard par le serveur", () => {
    expect(responses.StreamKey.parse(makeStreamKey({ rotatedAt: "hier" }))).toMatchObject({
      rotatedAt: "hier",
    });
  });

  it.each([
    ["sans clé", { streamKey: undefined }],
    ["avec une clé vide", { streamKey: "" }],
    ["sans adresse d'ingest", { ingestUrl: undefined }],
    ["avec une adresse d'ingest qui n'est pas une URL", { ingestUrl: "pas une url" }],
  ])("refuse une clé de stream %s", (_name, overrides) => {
    expect(responses.StreamKey.safeParse(makeStreamKey(overrides)).success).toBe(false);
  });
});
