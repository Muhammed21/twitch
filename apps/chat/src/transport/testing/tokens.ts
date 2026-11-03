import { exportJWK, generateKeyPair, SignJWT } from "jose";

import { createAccessTokenVerifier, type RevokedSessions } from "@repo/auth-verifier";

const API_BASE_URL = "http://api.test";
const ISSUER = `${API_BASE_URL}/auth`;
const AUDIENCE = `${API_BASE_URL}/v1`;

export const NO_REVOCATION: RevokedSessions = { isRevoked: async () => false };

export const makeTokenAuthority = async () => {
  const { privateKey, publicKey } = await generateKeyPair("EdDSA", { crv: "Ed25519" });
  const jwks = { keys: [{ ...(await exportJWK(publicKey)), kid: "test", alg: "EdDSA" }] };

  const sign = ({
    userId = "user-1",
    sid = "sid-1",
    expiresIn = "15m",
  }: { userId?: string; sid?: string; expiresIn?: string } = {}) =>
    new SignJWT({ sid })
      .setProtectedHeader({ alg: "EdDSA", kid: "test", typ: "at+jwt" })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(privateKey);

  const verifier = (revokedSessions: RevokedSessions = NO_REVOCATION) =>
    createAccessTokenVerifier({
      jwksUrl: `${ISSUER}/jwks`,
      issuer: ISSUER,
      audience: AUDIENCE,
      revokedSessions,
      fetchJwks: async () => Response.json(jwks),
    });

  return { sign, verifier };
};
