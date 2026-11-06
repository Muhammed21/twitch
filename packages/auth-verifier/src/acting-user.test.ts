import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";

import {
  ACTING_USER_AUDIENCE,
  ACTING_USER_ISSUER,
  ACTING_USER_LIFETIME_SECONDS,
  createActingUserVerifier,
  importActingUserPrivateKey,
  importActingUserPublicKey,
  signActingUser,
} from "./acting-user.ts";

const ADMIN_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const SIGNED_AT = new Date("2026-11-06T12:00:00.000Z");
const SIGNED_AT_SECONDS = SIGNED_AT.getTime() / 1000;

const keyPair = async () => {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA", {
    crv: "Ed25519",
    extractable: true,
  });
  return {
    publicJwk: JSON.stringify(await exportJWK(publicKey)),
    privateJwk: JSON.stringify(await exportJWK(privateKey)),
  };
};

const PAYLOAD_KEYS = await keyPair();
const OTHER_KEYS = await keyPair();

const verify = async (header: string, now: Date) =>
  createActingUserVerifier({
    publicKey: await importActingUserPublicKey(PAYLOAD_KEYS.publicJwk),
  }).verify(header, now);

const signedHeader = async (privateJwk = PAYLOAD_KEYS.privateJwk) =>
  signActingUser({
    userId: ADMIN_ID,
    privateKey: await importActingUserPrivateKey(privateJwk),
    now: SIGNED_AT,
  });

const secondsAfterSigning = (seconds: number) => new Date(SIGNED_AT.getTime() + seconds * 1000);

type Claims = {
  readonly sub?: string;
  readonly iss?: string;
  readonly aud?: string;
  readonly iat?: number;
  readonly exp?: number;
};

const VALID_CLAIMS: Claims = {
  sub: ADMIN_ID,
  iss: ACTING_USER_ISSUER,
  aud: ACTING_USER_AUDIENCE,
  iat: SIGNED_AT_SECONDS,
  exp: SIGNED_AT_SECONDS + ACTING_USER_LIFETIME_SECONDS,
};

const forged = async ({
  claims = VALID_CLAIMS,
  typ = "acting-user+jwt",
}: {
  claims?: Claims;
  typ?: string;
}) =>
  new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "EdDSA", typ })
    .sign(await importActingUserPrivateKey(PAYLOAD_KEYS.privateJwk));

describe("en-tête X-Acting-User (ADR 0007)", () => {
  it("rend l'humain d'un en-tête signé par Payload", async () => {
    expect(await verify(await signedHeader(), SIGNED_AT)).toEqual({
      ok: true,
      value: { userId: ADMIN_ID },
    });
  });

  it("accepte l'en-tête jusqu'à la fin de ses 60 secondes", async () => {
    const header = await signedHeader();

    expect((await verify(header, secondsAfterSigning(59))).ok).toBe(true);
  });

  it("refuse un en-tête expiré", async () => {
    const header = await signedHeader();

    expect(await verify(header, secondsAfterSigning(61))).toEqual({
      ok: false,
      error: "expired",
    });
  });

  it("refuse un en-tête signé par une autre clé", async () => {
    const header = await signedHeader(OTHER_KEYS.privateJwk);

    expect(await verify(header, SIGNED_AT)).toEqual({ ok: false, error: "invalid" });
  });

  it.each<[string, Claims]>([
    ["destiné à une autre audience", { ...VALID_CLAIMS, aud: "twitch-api" }],
    ["émis par un autre que Payload", { ...VALID_CLAIMS, iss: "twitch-api" }],
    ["sans humain", { ...VALID_CLAIMS, sub: undefined }],
    ["dont l'humain n'est pas un identifiant de compte", { ...VALID_CLAIMS, sub: "admin" }],
    ["sans date d'émission", { ...VALID_CLAIMS, iat: undefined }],
    ["sans expiration", { ...VALID_CLAIMS, exp: undefined }],
    ["valable plus de 60 secondes", { ...VALID_CLAIMS, exp: SIGNED_AT_SECONDS + 3600 }],
    [
      "émis dans le futur",
      { ...VALID_CLAIMS, iat: SIGNED_AT_SECONDS + 30, exp: SIGNED_AT_SECONDS + 90 },
    ],
  ])("refuse un en-tête %s", async (_case, claims) => {
    expect(await verify(await forged({ claims }), SIGNED_AT)).toEqual({
      ok: false,
      error: "invalid",
    });
  });

  it("refuse un jeton d'un autre type, même signé par la bonne clé", async () => {
    expect(await verify(await forged({ typ: "at+jwt" }), SIGNED_AT)).toEqual({
      ok: false,
      error: "invalid",
    });
  });

  it("refuse un en-tête qui n'est pas un JWT", async () => {
    expect(await verify("pas-un-jwt", SIGNED_AT)).toEqual({
      ok: false,
      error: "invalid",
    });
  });

  it("signe pour 60 secondes, pour l'audience de l'API, au nom de Payload", async () => {
    const [header, payload] = (await signedHeader()).split(".");

    expect(JSON.parse(Buffer.from(String(header), "base64url").toString())).toEqual({
      alg: "EdDSA",
      typ: "acting-user+jwt",
    });
    expect(JSON.parse(Buffer.from(String(payload), "base64url").toString())).toEqual({
      sub: ADMIN_ID,
      iss: "payload",
      aud: "twitch-api:admin",
      iat: SIGNED_AT_SECONDS,
      exp: SIGNED_AT_SECONDS + 60,
    });
  });

  it.each([
    ["une clé symétrique", '{"kty":"oct","k":"c2VjcmV0"}'],
    ["un texte qui n'est pas du JSON", "pas-une-clé"],
  ])("refuse d'importer %s comme clé de X-Acting-User", async (_case, jwk) => {
    await expect(importActingUserPublicKey(jwk)).rejects.toThrow(
      "Clé X-Acting-User attendue en JWK Ed25519",
    );
  });
});
