import { describe, expect, it } from "vitest";

import { parseEnvironment } from "./environment";

const valid = {
  PAYLOAD_DATABASE_URL: "postgresql://payload:secret@postgres:5432/payload",
  PAYLOAD_SECRET: "un-secret-de-trente-deux-caracteres-au-moins",
};

describe("l'environnement de Payload, validé au démarrage (ADR 0028 §8)", () => {
  it("accepte une configuration complète", () => {
    expect(parseEnvironment(valid)).toEqual({ ...valid, api: undefined });
  });

  it.each(["PAYLOAD_DATABASE_URL", "PAYLOAD_SECRET"])("refuse l'absence de %s", (name) => {
    expect(() => parseEnvironment({ ...valid, [name]: undefined })).toThrow(name);
  });

  it("refuse une URL qui n'est pas PostgreSQL", () => {
    expect(() =>
      parseEnvironment({ ...valid, PAYLOAD_DATABASE_URL: "mysql://payload@db/payload" }),
    ).toThrow("PAYLOAD_DATABASE_URL");
  });

  it("refuse un secret de moins de 32 caractères", () => {
    expect(() => parseEnvironment({ ...valid, PAYLOAD_SECRET: "court" })).toThrow("PAYLOAD_SECRET");
  });
});

const api = {
  PAYLOAD_API_BASE_URL: "http://api:3000",
  PAYLOAD_SERVICE_SECRET: "secret-du-compte-de-service-payload-admin",
  PAYLOAD_ACTING_USER_PRIVATE_KEY: '{"kty":"OKP","crv":"Ed25519","x":"x","d":"d"}',
};

describe("l'accès de Payload à l'API (ADR 0007)", () => {
  it("lit l'API, le secret du compte de service et la clé qui signe X-Acting-User", () => {
    expect(parseEnvironment({ ...valid, ...api }).api).toEqual({
      baseUrl: "http://api:3000",
      serviceSecret: api.PAYLOAD_SERVICE_SECRET,
      actingUserPrivateKey: api.PAYLOAD_ACTING_USER_PRIVATE_KEY,
    });
  });

  it("démarre sans API quand aucune des trois variables n'est posée, vides comprises", () => {
    expect(parseEnvironment(valid).api).toBeUndefined();
    expect(
      parseEnvironment({
        ...valid,
        PAYLOAD_API_BASE_URL: "",
        PAYLOAD_SERVICE_SECRET: "",
        PAYLOAD_ACTING_USER_PRIVATE_KEY: "",
      }).api,
    ).toBeUndefined();
  });

  it.each(Object.keys(api))("démarre sans API quand %s manque", (name) => {
    expect(parseEnvironment({ ...valid, ...api, [name]: undefined }).api).toBeUndefined();
  });

  it("refuse une API qui n'est pas une URL http(s)", () => {
    expect(() => parseEnvironment({ ...valid, ...api, PAYLOAD_API_BASE_URL: "ftp://api" })).toThrow(
      "PAYLOAD_API_BASE_URL",
    );
  });

  it("refuse un secret de service de moins de 32 caractères", () => {
    expect(() => parseEnvironment({ ...valid, ...api, PAYLOAD_SERVICE_SECRET: "court" })).toThrow(
      "PAYLOAD_SERVICE_SECRET",
    );
  });
});
