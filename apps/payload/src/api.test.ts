import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { apiClientOf } from "./api";

const PRIVATE_JWK = JSON.stringify(
  generateKeyPairSync("ed25519").privateKey.export({ format: "jwk" }),
);

const ACCESS = {
  baseUrl: "http://api.test",
  serviceSecret: "secret-du-compte-de-service-payload-admin",
  actingUserPrivateKey: PRIVATE_JWK,
};

describe("client de l'API du back-office", () => {
  it("n'a pas de client quand l'API n'est pas configurée", async () => {
    expect(await apiClientOf(() => undefined)()).toBeUndefined();
  });

  it("construit le client une seule fois, à la première action", async () => {
    const clientOf = apiClientOf(() => ACCESS);

    const first = await clientOf();

    expect(first?.moderation.banUser).toBeTypeOf("function");
    expect(await clientOf()).toBe(first);
  });

  it("échoue sur une clé de signature illisible", async () => {
    await expect(
      apiClientOf(() => ({ ...ACCESS, actingUserPrivateKey: "pas une clé" }))(),
    ).rejects.toThrow("Clé X-Acting-User attendue en JWK Ed25519");
  });
});
