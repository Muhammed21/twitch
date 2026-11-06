import { type CryptoKey, errors, importJWK, jwtVerify, SignJWT } from "jose";
import { z } from "zod";

import { err, ok, type Result } from "@repo/result";

export const ACTING_USER_HEADER = "x-acting-user";
export const ACTING_USER_ISSUER = "payload";
export const ACTING_USER_AUDIENCE = "twitch-api:admin";
export const ACTING_USER_LIFETIME_SECONDS = 60;

const ALGORITHM = "EdDSA";
const TYPE = "acting-user+jwt";

export type ActingUser = { readonly userId: string };

export type ActingUserFailure = "expired" | "invalid";

export interface ActingUserVerifier {
  verify(header: string, now: Date): Promise<Result<ActingUser, ActingUserFailure>>;
}

const ActingUserClaims = z.object({
  sub: z.uuid(),
  iat: z.number(),
  exp: z.number(),
});

const NOT_ED25519 = "Clé X-Acting-User attendue en JWK Ed25519";

const importEd25519 = async (jwk: string): Promise<CryptoKey> => {
  const key = await Promise.resolve()
    .then(() => importJWK(JSON.parse(jwk), ALGORITHM))
    .catch(() => undefined);
  if (key === undefined || key instanceof Uint8Array) {
    throw new Error(NOT_ED25519);
  }
  return key;
};

export const importActingUserPublicKey = importEd25519;
export const importActingUserPrivateKey = importEd25519;

const toSeconds = (date: Date) => Math.floor(date.getTime() / 1000);

export const signActingUser = ({
  userId,
  privateKey,
  now,
}: {
  userId: string;
  privateKey: CryptoKey;
  now: Date;
}): Promise<string> =>
  new SignJWT({})
    .setProtectedHeader({ alg: ALGORITHM, typ: TYPE })
    .setSubject(userId)
    .setIssuer(ACTING_USER_ISSUER)
    .setAudience(ACTING_USER_AUDIENCE)
    .setIssuedAt(toSeconds(now))
    .setExpirationTime(toSeconds(now) + ACTING_USER_LIFETIME_SECONDS)
    .sign(privateKey);

export const createActingUserVerifier = ({
  publicKey,
}: {
  publicKey: CryptoKey;
}): ActingUserVerifier => ({
  verify: async (header, now) => {
    try {
      const { payload } = await jwtVerify(header, publicKey, {
        issuer: ACTING_USER_ISSUER,
        audience: ACTING_USER_AUDIENCE,
        typ: TYPE,
        algorithms: [ALGORITHM],
        maxTokenAge: ACTING_USER_LIFETIME_SECONDS,
        currentDate: now,
      });
      const claims = ActingUserClaims.parse(payload);
      if (claims.exp - claims.iat > ACTING_USER_LIFETIME_SECONDS) {
        return err("invalid");
      }
      return ok({ userId: claims.sub });
    } catch (error) {
      return err(error instanceof errors.JWTExpired ? "expired" : "invalid");
    }
  },
});
