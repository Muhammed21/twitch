import { describe, expect, it } from "vitest";

import { loadEnv } from "./env.ts";

const makeEnv = (overrides: Record<string, string | undefined> = {}) => ({
  REDIS_URL: "redis://127.0.0.1:6379",
  ...overrides,
});

describe("loadEnv", () => {
  it("écoute par défaut sur 3001 et lit les jetons de l'API locale", () => {
    expect(loadEnv(makeEnv())).toEqual({
      httpPort: 3001,
      redisUrl: "redis://127.0.0.1:6379",
      accessTokens: {
        jwksUrl: "http://127.0.0.1:3000/auth/jwks",
        issuer: "http://127.0.0.1:3000/auth",
        audience: "http://127.0.0.1:3000/v1",
      },
    });
  });

  it("dérive émetteur, audience et JWKS de l'URL de l'API", () => {
    expect(
      loadEnv(makeEnv({ CHAT_HTTP_PORT: "4001", CHAT_API_BASE_URL: "https://api.twitch.test" })),
    ).toMatchObject({
      httpPort: 4001,
      accessTokens: {
        jwksUrl: "https://api.twitch.test/auth/jwks",
        issuer: "https://api.twitch.test/auth",
        audience: "https://api.twitch.test/v1",
      },
    });
  });

  it("lit le JWKS à CHAT_API_JWKS_URL, sans changer émetteur ni audience", () => {
    expect(
      loadEnv(
        makeEnv({
          CHAT_API_BASE_URL: "http://127.0.0.1:3000",
          CHAT_API_JWKS_URL: "http://api:3000/auth/jwks",
        }),
      ).accessTokens,
    ).toEqual({
      jwksUrl: "http://api:3000/auth/jwks",
      issuer: "http://127.0.0.1:3000/auth",
      audience: "http://127.0.0.1:3000/v1",
    });
  });

  it.each([
    ["une API en http explicite", { CHAT_API_BASE_URL: "http://api.twitch.test" }],
    ["un Redis en TLS", { REDIS_URL: "rediss://cache.twitch.test:6380" }],
  ])("accepte %s", (_name, overrides) => {
    expect(() => loadEnv(makeEnv(overrides))).not.toThrow();
  });

  it("nomme toutes les variables à corriger", () => {
    expect(() => loadEnv(makeEnv({ REDIS_URL: undefined, CHAT_HTTP_PORT: "abc" }))).toThrow(
      "Configuration invalide, variables à corriger : CHAT_HTTP_PORT, REDIS_URL",
    );
  });

  it.each([
    ["sans Redis", makeEnv({ REDIS_URL: undefined }), "REDIS_URL"],
    ["avec un schéma qui finit par redis", makeEnv({ REDIS_URL: "xredis://x" }), "REDIS_URL"],
    ["avec un schéma qui commence par redis", makeEnv({ REDIS_URL: "redisx://x" }), "REDIS_URL"],
    [
      "avec une API au schéma qui finit par http",
      makeEnv({ CHAT_API_BASE_URL: "xhttp://api" }),
      "CHAT_API_BASE_URL",
    ],
    [
      "avec une API au schéma qui commence par http",
      makeEnv({ CHAT_API_BASE_URL: "httpx://api" }),
      "CHAT_API_BASE_URL",
    ],
    ["avec un Redis qui n'est pas une URL redis", makeEnv({ REDIS_URL: "http://x" }), "REDIS_URL"],
    ["avec un port hors plage", makeEnv({ CHAT_HTTP_PORT: "70000" }), "CHAT_HTTP_PORT"],
    ["avec un port nul", makeEnv({ CHAT_HTTP_PORT: "0" }), "CHAT_HTTP_PORT"],
    [
      "avec un JWKS qui n'est pas une URL http",
      makeEnv({ CHAT_API_JWKS_URL: "ftp://api/auth/jwks" }),
      "CHAT_API_JWKS_URL",
    ],
    [
      "avec un JWKS au schéma qui finit par http",
      makeEnv({ CHAT_API_JWKS_URL: "xhttp://api/auth/jwks" }),
      "CHAT_API_JWKS_URL",
    ],
    [
      "avec un JWKS au schéma qui commence par http",
      makeEnv({ CHAT_API_JWKS_URL: "httpx://api/auth/jwks" }),
      "CHAT_API_JWKS_URL",
    ],
    [
      "avec une API qui n'est pas une URL http",
      makeEnv({ CHAT_API_BASE_URL: "ftp://api" }),
      "CHAT_API_BASE_URL",
    ],
  ])("refuse une configuration %s, en nommant la variable", (_name, env, variable) => {
    expect(() => loadEnv(env)).toThrow(
      `Configuration invalide, variables à corriger : ${variable}`,
    );
  });
});
