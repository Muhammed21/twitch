import { describe, expect, it } from "vitest";

import { loadEnv } from "./env.ts";

const failureOf = (load: () => unknown): string => {
  try {
    load();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "aucune erreur";
};

const SERVICE_SECRET = "s".repeat(32);

const makeEnv = (overrides: Record<string, string> = {}) => ({
  VIDEO_SERVICE_SECRET: SERVICE_SECRET,
  ...overrides,
});

describe("loadEnv", () => {
  it("écoute en HTTP sur le port 3002 et annonce l'ingest local par défaut", () => {
    expect(loadEnv(makeEnv())).toEqual({
      httpPort: 3002,
      serviceSecret: SERVICE_SECRET,
      ingestUrl: "rtmp://127.0.0.1:1935/live",
    });
  });

  it("lit le port HTTP", () => {
    expect(loadEnv(makeEnv({ VIDEO_HTTP_PORT: "8080" })).httpPort).toBe(8080);
  });

  it.each(["rtmp://ingest.example/live", "rtmps://ingest.example:443/live"])(
    "lit l'URL d'ingest %s",
    (url) => {
      expect(loadEnv(makeEnv({ VIDEO_INGEST_URL: url })).ingestUrl).toBe(url);
    },
  );

  it.each([
    "https://ingest.example/live",
    "xrtmp://ingest.example/live",
    "rtmpx://ingest.example/live",
    "pas-une-url",
    "",
  ])("refuse l'URL d'ingest %j en nommant VIDEO_INGEST_URL", (url) => {
    expect(failureOf(() => loadEnv(makeEnv({ VIDEO_INGEST_URL: url })))).toBe(
      "Configuration invalide, variables à corriger : VIDEO_INGEST_URL",
    );
  });

  it("nomme toutes les variables invalides", () => {
    expect(failureOf(() => loadEnv({ VIDEO_HTTP_PORT: "abc" }))).toBe(
      "Configuration invalide, variables à corriger : VIDEO_HTTP_PORT, VIDEO_SERVICE_SECRET",
    );
  });

  it("exige le secret de service", () => {
    expect(failureOf(() => loadEnv({}))).toBe(
      "Configuration invalide, variables à corriger : VIDEO_SERVICE_SECRET",
    );
  });

  it("accepte un secret de service de 32 caractères, refuse 31", () => {
    expect(loadEnv(makeEnv({ VIDEO_SERVICE_SECRET: "x".repeat(32) })).serviceSecret).toBe(
      "x".repeat(32),
    );
    expect(failureOf(() => loadEnv(makeEnv({ VIDEO_SERVICE_SECRET: "x".repeat(31) })))).toBe(
      "Configuration invalide, variables à corriger : VIDEO_SERVICE_SECRET",
    );
  });

  it.each([
    ["1", 1],
    ["65535", 65_535],
  ])("accepte le port limite %s", (port, expected) => {
    expect(loadEnv(makeEnv({ VIDEO_HTTP_PORT: port })).httpPort).toBe(expected);
  });

  it.each(["0", "65536", "-1", "-1.5", "abc", "80.5", ""])(
    "refuse le port %j en nommant VIDEO_HTTP_PORT",
    (port) => {
      expect(failureOf(() => loadEnv(makeEnv({ VIDEO_HTTP_PORT: port })))).toBe(
        "Configuration invalide, variables à corriger : VIDEO_HTTP_PORT",
      );
    },
  );

  it("ne recopie jamais la valeur d'une variable dans l'erreur", () => {
    const failure = failureOf(() =>
      loadEnv({ VIDEO_HTTP_PORT: "valeur-confidentielle-42", VIDEO_SERVICE_SECRET: "court" }),
    );

    expect(failure).toContain("VIDEO_HTTP_PORT");
    expect(failure).not.toContain("valeur-confidentielle-42");
    expect(failure).not.toContain("court");
  });
});
