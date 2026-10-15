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

describe("loadEnv", () => {
  it("écoute en HTTP sur le port 3002 par défaut", () => {
    expect(loadEnv({})).toEqual({ httpPort: 3002 });
  });

  it("lit le port HTTP", () => {
    expect(loadEnv({ VIDEO_HTTP_PORT: "8080" }).httpPort).toBe(8080);
  });

  it.each([
    ["1", 1],
    ["65535", 65_535],
  ])("accepte le port limite %s", (port, expected) => {
    expect(loadEnv({ VIDEO_HTTP_PORT: port }).httpPort).toBe(expected);
  });

  it.each(["0", "65536", "-1", "-1.5", "abc", "80.5", ""])(
    "refuse le port %j en nommant VIDEO_HTTP_PORT",
    (port) => {
      expect(failureOf(() => loadEnv({ VIDEO_HTTP_PORT: port }))).toBe(
        "Configuration invalide, variables à corriger : VIDEO_HTTP_PORT",
      );
    },
  );

  it("ne recopie jamais la valeur d'une variable dans l'erreur", () => {
    const failure = failureOf(() => loadEnv({ VIDEO_HTTP_PORT: "valeur-confidentielle-42" }));

    expect(failure).toContain("VIDEO_HTTP_PORT");
    expect(failure).not.toContain("valeur-confidentielle-42");
  });
});
