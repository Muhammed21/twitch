import { describe, expect, it } from "vitest";

import { loadEnv } from "./env.ts";

const HEALTH_URL = "postgresql://app_health:secret@127.0.0.1:5432/app";

const AUTH_SECRET = "s".repeat(32);

const makeEnv = (overrides: Record<string, string | undefined> = {}) => ({
  DATABASE_URL_HEALTH: HEALTH_URL,
  BETTER_AUTH_SECRET: AUTH_SECRET,
  BETTER_AUTH_URL: "http://127.0.0.1:3000",
  ...overrides,
});

describe("loadEnv", () => {
  it("lit la configuration, avec le port 3000 par défaut", () => {
    expect(loadEnv(makeEnv())).toEqual({
      port: 3000,
      databaseUrlHealth: HEALTH_URL,
      authSecret: AUTH_SECRET,
      authBaseUrl: "http://127.0.0.1:3000",
    });
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
      "Configuration invalide, variables à corriger : API_PORT, DATABASE_URL_HEALTH, BETTER_AUTH_SECRET, BETTER_AUTH_URL",
    );
  });

  it.each([undefined, "", "trop-court"])("refuse BETTER_AUTH_SECRET %j en la nommant", (secret) => {
    expect(() => loadEnv(makeEnv({ BETTER_AUTH_SECRET: secret }))).toThrow("BETTER_AUTH_SECRET");
  });

  it.each([undefined, "", "pas une url", "ftp://h", "xhttp://h", "https2://h"])(
    "refuse BETTER_AUTH_URL %j en la nommant",
    (url) => {
      expect(() => loadEnv(makeEnv({ BETTER_AUTH_URL: url }))).toThrow("BETTER_AUTH_URL");
    },
  );

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
