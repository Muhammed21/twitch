import { createRemoteJWKSet, customFetch, type FetchImplementation, jwtVerify } from "jose";
import { z } from "zod";

import { err, ok, type Result } from "@repo/result";

const JWKS_CACHE_MAX_AGE_MS = 10 * 60_000;
const JWKS_RELOAD_COOLDOWN_MS = 60_000;

export interface RevokedSessions {
  isRevoked(sid: string): Promise<boolean>;
}

export type AccessTokenIdentity = {
  readonly userId: string;
  readonly sid: string;
  readonly scopes: readonly string[];
  readonly authTime: Date | null;
  readonly amr: readonly string[];
  readonly revocation: "checked" | "unavailable";
};

export type VerificationFailure = "invalid_token" | "revoked";

const AccessTokenClaims = z.object({
  sub: z.string(),
  sid: z.string(),
  scope: z.string().optional(),
  twitch_auth_time: z.number().optional(),
  twitch_amr: z.array(z.string()).optional(),
});

const revocationOf = async (
  revokedSessions: RevokedSessions,
  sid: string,
): Promise<"checked" | "unavailable" | "revoked"> => {
  try {
    return (await revokedSessions.isRevoked(sid)) ? "revoked" : "checked";
  } catch {
    return "unavailable";
  }
};

export const createAccessTokenVerifier = ({
  jwksUrl,
  issuer,
  audience,
  revokedSessions,
  fetchJwks = fetch,
}: {
  jwksUrl: string;
  issuer: string;
  audience: string;
  revokedSessions: RevokedSessions;
  fetchJwks?: FetchImplementation;
}) => {
  const keySet = createRemoteJWKSet(new URL(jwksUrl), {
    cacheMaxAge: JWKS_CACHE_MAX_AGE_MS,
    cooldownDuration: JWKS_RELOAD_COOLDOWN_MS,
    [customFetch]: fetchJwks,
  });

  const identityOf = async ({
    sub,
    sid,
    scope,
    twitch_auth_time,
    twitch_amr,
  }: z.infer<typeof AccessTokenClaims>): Promise<
    Result<AccessTokenIdentity, VerificationFailure>
  > => {
    const revocation = await revocationOf(revokedSessions, sid);
    if (revocation === "revoked") {
      return err("revoked");
    }
    return ok({
      userId: sub,
      sid,
      scopes: scope === undefined ? [] : scope.split(" "),
      authTime: twitch_auth_time === undefined ? null : new Date(twitch_auth_time * 1000),
      amr: twitch_amr ?? [],
      revocation,
    });
  };

  return {
    verify: async (token: string): Promise<Result<AccessTokenIdentity, VerificationFailure>> => {
      try {
        const { payload } = await jwtVerify(token, keySet, {
          issuer,
          audience,
          typ: "at+jwt",
          algorithms: ["EdDSA"],
        });
        return await identityOf(AccessTokenClaims.parse(payload));
      } catch {
        return err("invalid_token");
      }
    },
  };
};
