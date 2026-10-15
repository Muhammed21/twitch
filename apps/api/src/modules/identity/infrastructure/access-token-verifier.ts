import { createAccessTokenVerifier } from "@repo/auth-verifier";

import { apiResourceOf, type IdentityAuth } from "./better-auth.ts";
import { type IdentityRedis, redisRevokedSessions } from "./redis-session-revocation.ts";

export const createIdentityAccessTokenVerifier = ({
  auth,
  redis,
  baseURL,
}: {
  auth: IdentityAuth;
  redis: IdentityRedis;
  baseURL: string;
}) =>
  createAccessTokenVerifier({
    jwksUrl: new URL("/auth/jwks", baseURL).href,
    issuer: new URL("/auth", baseURL).href,
    audience: apiResourceOf(baseURL),
    revokedSessions: redisRevokedSessions(redis),
    fetchJwks: (url, init) => auth.handler(new Request(url, init)),
  });
