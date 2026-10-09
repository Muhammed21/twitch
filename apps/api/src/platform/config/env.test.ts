import { describe, expect, it } from "vitest";

import { loadEnv } from "./env.ts";

const HEALTH_URL = "postgresql://app_health:secret@127.0.0.1:5432/app";

const makeEnv = (overrides: Record<string, string | undefined> = {}) => ({
  DATABASE_URL_HEALTH: HEALTH_URL,
  ...overrides,
});

describe("loadEnv", () => {
  it("lit la configuration, avec le port 3000 par défaut", () => {
    expect(loadEnv(makeEnv())).toEqual({ port: 3000, databaseUrlHealth: HEALTH_URL });
  });

  it("lit le port", () => {
    expect(loadEnv(makeEnv({ API_PORT: "8080" })).port).toBe(8080);
  });

  it.each(["0", "65536", "abc", "80.5", ""])("refuse le port %j en nommant API_PORT", (port) => {
    expect(() => loadEnv(makeEnv({ API_PORT: port }))).toThrow("API_PORT");
  });

  it.each([undefined, "", "mysql://h/app", "pas une url"])(
    "refuse DATABASE_URL_HEALTH %j en la nommant",
    (url) => {
      expect(() => loadEnv(makeEnv({ DATABASE_URL_HEALTH: url }))).toThrow("DATABASE_URL_HEALTH");
    },
  );

  it("nomme toutes les variables invalides à la fois", () => {
    expect(() => loadEnv({ API_PORT: "abc" })).toThrow(
      "Configuration invalide, variables à corriger : API_PORT, DATABASE_URL_HEALTH",
    );
  });

  it("accepte une URL postgres:// courte", () => {
    expect(loadEnv(makeEnv({ DATABASE_URL_HEALTH: "postgres://h/app" })).databaseUrlHealth).toBe(
      "postgres://h/app",
    );
  });

  it.each(["xpostgresql://h/app", "postgresql://h/app avec espace"])(
    "refuse l'URL mal ancrée %j",
    (url) => {
      expect(() => loadEnv(makeEnv({ DATABASE_URL_HEALTH: url }))).toThrow("DATABASE_URL_HEALTH");
    },
  );

  it("ne recopie jamais la valeur d'une variable dans l'erreur", () => {
    const failure = (() => {
      try {
        loadEnv(makeEnv({ DATABASE_URL_HEALTH: "valeur-confidentielle-42" }));
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
      return "aucune erreur";
    })();

    expect(failure).toContain("DATABASE_URL_HEALTH");
    expect(failure).not.toContain("valeur-confidentielle-42");
  });
});
