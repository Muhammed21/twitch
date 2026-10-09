import { describe, expect, it, vi } from "vitest";

import { contexts, createContextClient, contextPoolConfig } from "./index.ts";

const VIDEO_URL = "postgresql://app_video:secret@127.0.0.1:5432/app";
const CHAT_URL = "postgresql://app_chat:secret@127.0.0.1:5432/app";

describe("createContextClient", () => {
  const env = { DATABASE_URL_VIDEO: VIDEO_URL, DATABASE_URL_CHAT: CHAT_URL };

  it("donne un client qui n'ouvre aucune connexion avant sa première requête", async () => {
    const client = createContextClient({ context: "video", env });

    await expect(client.$disconnect()).resolves.toBeUndefined();
  });

  it("vise la base de l'URL du contexte", async () => {
    const client = createContextClient({
      context: "video",
      env: { DATABASE_URL_VIDEO: "postgresql://app_video:secret@127.0.0.1:1/app" },
    });

    await expect(client.$executeRaw`SELECT 1`).rejects.toThrow("127.0.0.1:1");
  });

  it("donne deux clients distincts pour deux contextes", () => {
    expect(createContextClient({ context: "video", env })).not.toBe(
      createContextClient({ context: "chat", env }),
    );
  });

  it("donne un nouveau client à chaque appel sur le même contexte", () => {
    expect(createContextClient({ context: "video", env })).not.toBe(
      createContextClient({ context: "video", env }),
    );
  });

  it("refuse une configuration invalide avant de créer le client", () => {
    expect(() => createContextClient({ context: "video", env: {} })).toThrow("DATABASE_URL_VIDEO");
  });

  it("lit l'environnement du process par défaut", () => {
    vi.stubEnv("DATABASE_URL_VIDEO", undefined);

    expect(() => createContextClient({ context: "video" })).toThrow("DATABASE_URL_VIDEO");
  });
});

describe("contextPoolConfig", () => {
  it.each(contexts)("lit l'URL du contexte %s dans sa propre variable", (context) => {
    const url = `postgresql://app_${context}:secret@127.0.0.1:5432/app`;
    const env = { [`DATABASE_URL_${context.toUpperCase()}`]: url };

    expect(contextPoolConfig({ context, env }).connectionString).toBe(url);
  });

  it("ignore la variable d'un autre contexte", () => {
    expect(() =>
      contextPoolConfig({ context: "video", env: { DATABASE_URL_CHAT: VIDEO_URL } }),
    ).toThrow("DATABASE_URL_VIDEO");
  });

  it("nomme la variable d'URL absente", () => {
    expect(() => contextPoolConfig({ context: "video", env: {} })).toThrow("DATABASE_URL_VIDEO");
  });

  it("accepte le schéma d'URL postgres://", () => {
    const url = "postgres://app_video:secret@127.0.0.1:5432/app";

    expect(
      contextPoolConfig({ context: "video", env: { DATABASE_URL_VIDEO: url } }).connectionString,
    ).toBe(url);
  });

  it.each([
    "",
    "mysql://app_video:secret@127.0.0.1:3306/app",
    "pas une url",
    "xpostgresql://h/app",
    "postgresql://h/app avec espace",
  ])("refuse l'URL mal formée %j en nommant la variable", (url) => {
    expect(() => contextPoolConfig({ context: "video", env: { DATABASE_URL_VIDEO: url } })).toThrow(
      "DATABASE_URL_VIDEO",
    );
  });

  it("donne un pool de 5 connexions quand la taille n'est pas fixée", () => {
    expect(
      contextPoolConfig({ context: "video", env: { DATABASE_URL_VIDEO: VIDEO_URL } }).max,
    ).toBe(5);
  });

  it.each([
    ["1", 1],
    ["120", 120],
  ])("lit la taille de pool %j dans la variable du contexte", (poolMax, expected) => {
    const env = { DATABASE_URL_VIDEO: VIDEO_URL, DATABASE_POOL_MAX_VIDEO: poolMax };

    expect(contextPoolConfig({ context: "video", env }).max).toBe(expected);
  });

  it.each(["0", "-1", "abc", "2.5", ""])(
    "refuse la taille de pool %j en nommant la variable",
    (poolMax) => {
      const env = { DATABASE_URL_VIDEO: VIDEO_URL, DATABASE_POOL_MAX_VIDEO: poolMax };

      expect(() => contextPoolConfig({ context: "video", env })).toThrow("DATABASE_POOL_MAX_VIDEO");
    },
  );

  it("refuse un contexte inconnu à la compilation et à l'exécution", () => {
    expect(() =>
      // @ts-expect-error — "billing" n'est pas un contexte
      contextPoolConfig({ context: "billing", env: { DATABASE_URL_BILLING: VIDEO_URL } }),
    ).toThrow("billing");
  });
});
