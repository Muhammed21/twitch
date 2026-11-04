import { describe, expect, it } from "vitest";

import { integrationEnv } from "./integration-env.ts";

const LOCAL_STACK = {
  DATABASE_URL: "postgresql://app@127.0.0.1:5432/twitch",
  S3_ENDPOINT: "http://127.0.0.1:8333",
  S3_PUBLIC_ENDPOINT: "http://127.0.0.1:8333",
  S3_PUBLIC_BASE_URL: "http://127.0.0.1:8333/twitch-local",
  S3_BUCKET: "twitch-local",
};

describe("environnement des tests d'intégration", () => {
  it("garde les variables du .env hors S3", () => {
    expect(integrationEnv({ dotenv: LOCAL_STACK, shell: {} })).toMatchObject({
      DATABASE_URL: LOCAL_STACK.DATABASE_URL,
      S3_BUCKET: "twitch-local",
    });
  });

  it("détourne S3 vers une adresse qui ne résout pas, sans le S3 du .env, et désactive les tests S3", () => {
    const env = integrationEnv({ dotenv: LOCAL_STACK, shell: {} });

    expect(env).toMatchObject({
      S3_ENDPOINT: "http://s3.integration.invalid",
      S3_PUBLIC_ENDPOINT: "http://s3.integration.invalid",
      S3_PUBLIC_BASE_URL: "http://s3.integration.invalid/twitch-local",
    });
    expect(env).not.toHaveProperty("INTEGRATION_S3");
  });

  it("vise le S3 donné explicitement par INTEGRATION_S3_ENDPOINT, et active les tests S3", () => {
    const env = integrationEnv({
      dotenv: LOCAL_STACK,
      shell: { INTEGRATION_S3_ENDPOINT: "http://127.0.0.1:18333" },
    });

    expect(env).toMatchObject({
      S3_ENDPOINT: "http://127.0.0.1:18333",
      S3_PUBLIC_ENDPOINT: "http://127.0.0.1:18333",
      S3_PUBLIC_BASE_URL: "http://127.0.0.1:18333/twitch-local",
      INTEGRATION_S3: "1",
    });
  });

  it("ignore un INTEGRATION_S3_ENDPOINT écrit dans le .env", () => {
    const env = integrationEnv({
      dotenv: { ...LOCAL_STACK, INTEGRATION_S3_ENDPOINT: "http://127.0.0.1:8333" },
      shell: {},
    });

    expect(env).toMatchObject({ S3_ENDPOINT: "http://s3.integration.invalid" });
    expect(env).not.toHaveProperty("INTEGRATION_S3");
  });

  it("ne donne pas d'URL publique des images sans bucket, et ignore les variables sans valeur", () => {
    expect(integrationEnv({ dotenv: { UNSET: undefined }, shell: {} })).toStrictEqual({
      S3_ENDPOINT: "http://s3.integration.invalid",
      S3_PUBLIC_ENDPOINT: "http://s3.integration.invalid",
    });
  });
});
