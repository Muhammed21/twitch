import { describe, expect, it } from "vitest";

import { integrationEnv } from "./integration-env.ts";

const ISOLATED_STACK = {
  DATABASE_URL: "postgresql://app@127.0.0.1:55432/twitch",
  S3_ENDPOINT: "http://127.0.0.1:8333",
  S3_PUBLIC_ENDPOINT: "http://127.0.0.1:8333",
  S3_PUBLIC_BASE_URL: "http://127.0.0.1:8333/twitch-local",
  S3_BUCKET: "twitch-local",
};

describe("environnement des tests d'intégration", () => {
  it("garde les variables du .env hors S3", () => {
    expect(integrationEnv({ dotenv: ISOLATED_STACK, shell: {} })).toMatchObject({
      DATABASE_URL: ISOLATED_STACK.DATABASE_URL,
      S3_BUCKET: "twitch-local",
    });
  });

  it("détourne S3 vers une adresse qui ne résout pas, sans le S3 du .env, et désactive les tests S3", () => {
    const env = integrationEnv({ dotenv: ISOLATED_STACK, shell: {} });

    expect(env).toMatchObject({
      S3_ENDPOINT: "http://s3.integration.invalid",
      S3_PUBLIC_ENDPOINT: "http://s3.integration.invalid",
      S3_PUBLIC_BASE_URL: "http://s3.integration.invalid/twitch-local",
    });
    expect(env).not.toHaveProperty("INTEGRATION_S3");
  });

  it("vise le S3 donné explicitement par INTEGRATION_S3_ENDPOINT, et active les tests S3", () => {
    const env = integrationEnv({
      dotenv: ISOLATED_STACK,
      shell: { INTEGRATION_S3_ENDPOINT: "http://127.0.0.1:18333" },
    });

    expect(env).toMatchObject({
      S3_ENDPOINT: "http://127.0.0.1:18333",
      S3_PUBLIC_ENDPOINT: "http://127.0.0.1:18333",
      S3_PUBLIC_BASE_URL: "http://127.0.0.1:18333/twitch-local",
      INTEGRATION_S3: "1",
    });
  });

  it("traite un INTEGRATION_S3_ENDPOINT vide comme absent", () => {
    const env = integrationEnv({ dotenv: ISOLATED_STACK, shell: { INTEGRATION_S3_ENDPOINT: "" } });

    expect(env).toMatchObject({
      S3_ENDPOINT: "http://s3.integration.invalid",
      S3_PUBLIC_BASE_URL: "http://s3.integration.invalid/twitch-local",
    });
    expect(env).not.toHaveProperty("INTEGRATION_S3");
  });

  it("ignore un INTEGRATION_S3_ENDPOINT écrit dans le .env", () => {
    const env = integrationEnv({
      dotenv: { ...ISOLATED_STACK, INTEGRATION_S3_ENDPOINT: "http://127.0.0.1:8333" },
      shell: {},
    });

    expect(env).toMatchObject({ S3_ENDPOINT: "http://s3.integration.invalid" });
    expect(env).not.toHaveProperty("INTEGRATION_S3");
  });

  it("laisse une variable du shell primer sur la même variable du .env", () => {
    const shell = { DATABASE_URL: "postgresql://app@127.0.0.1:56432/twitch" };

    expect(integrationEnv({ dotenv: ISOLATED_STACK, shell })).toMatchObject(shell);
  });

  it("refuse de viser la pile locale, sur 127.0.0.1:5432, sans accord explicite", () => {
    const dotenv = {
      ...ISOLATED_STACK,
      DATABASE_URL_STREAM: "postgresql://app@127.0.0.1:5432/app",
    };

    expect(() => integrationEnv({ dotenv, shell: {} })).toThrow(
      "DATABASE_URL_STREAM vise la pile locale (127.0.0.1:5432) : les tests d'intégration y " +
        "écriraient. Visez une pile isolée en surchargeant DATABASE_URL_* dans le shell, " +
        "ou acceptez-le avec INTEGRATION_ALLOW_LOCAL_STACK=1.",
    );
  });

  it("refuse toute base Postgres de la pile locale, quel que soit le nom de sa variable", () => {
    const dotenv = {
      ...ISOLATED_STACK,
      PAYLOAD_DATABASE_URL: "postgresql://payload@127.0.0.1:5432/payload",
    };

    expect(() => integrationEnv({ dotenv, shell: {} })).toThrow(
      "PAYLOAD_DATABASE_URL vise la pile locale",
    );
  });

  it("laisse passer un service local qui n'est pas Postgres, ou une valeur qui n'est pas une URL", () => {
    const dotenv = {
      ...ISOLATED_STACK,
      MAILPIT_URL: "http://127.0.0.1:5432",
      DATABASE_POOL_MAX_STREAM: "5",
    };

    expect(integrationEnv({ dotenv, shell: {} })).toMatchObject({
      MAILPIT_URL: dotenv.MAILPIT_URL,
      DATABASE_POOL_MAX_STREAM: "5",
    });
  });

  it("ne reprend du shell que ce qui surcharge le .env et ses bases DATABASE_URL_*", () => {
    const shell = { PATH: "/usr/bin", DATABASE_URL_CHAT: "postgresql://app@127.0.0.1:55432/app" };

    const env = integrationEnv({ dotenv: ISOLATED_STACK, shell });

    expect(env).toMatchObject({ DATABASE_URL_CHAT: shell.DATABASE_URL_CHAT });
    expect(env).not.toHaveProperty("PATH");
  });

  it.each([
    "postgresql://app@localhost:5432/app",
    "postgresql://app@[::1]:5432/app",
    "postgres://app@127.0.0.1/app",
  ])("reconnaît la pile locale derrière %s", (url) => {
    expect(() =>
      integrationEnv({ dotenv: { ...ISOLATED_STACK, DATABASE_URL_MIGRATOR: url }, shell: {} }),
    ).toThrow("DATABASE_URL_MIGRATOR vise la pile locale");
  });

  it("refuse aussi la pile locale venue du shell", () => {
    expect(() =>
      integrationEnv({
        dotenv: ISOLATED_STACK,
        shell: { DATABASE_URL_CHAT: "postgresql://app@127.0.0.1:5432/app" },
      }),
    ).toThrow("DATABASE_URL_CHAT vise la pile locale");
  });

  it("vise la pile locale quand INTEGRATION_ALLOW_LOCAL_STACK=1 est donné dans le shell", () => {
    const dotenv = { ...ISOLATED_STACK, DATABASE_URL: "postgresql://app@127.0.0.1:5432/app" };

    expect(integrationEnv({ dotenv, shell: { INTEGRATION_ALLOW_LOCAL_STACK: "1" } })).toMatchObject(
      { DATABASE_URL: dotenv.DATABASE_URL },
    );
  });

  it("ignore un INTEGRATION_ALLOW_LOCAL_STACK écrit dans le .env", () => {
    const dotenv = {
      ...ISOLATED_STACK,
      DATABASE_URL: "postgresql://app@127.0.0.1:5432/app",
      INTEGRATION_ALLOW_LOCAL_STACK: "1",
    };

    expect(() => integrationEnv({ dotenv, shell: {} })).toThrow("vise la pile locale");
  });

  it("laisse passer une base distante sur le port 5432", () => {
    const dotenv = { ...ISOLATED_STACK, DATABASE_URL: "postgresql://app@postgres:5432/app" };

    expect(integrationEnv({ dotenv, shell: {} })).toMatchObject({
      DATABASE_URL: dotenv.DATABASE_URL,
    });
  });

  it("ne donne pas d'URL publique des images sans bucket, et ignore les variables sans valeur", () => {
    expect(integrationEnv({ dotenv: { UNSET: undefined }, shell: {} })).toStrictEqual({
      S3_ENDPOINT: "http://s3.integration.invalid",
      S3_PUBLIC_ENDPOINT: "http://s3.integration.invalid",
    });
  });
});
