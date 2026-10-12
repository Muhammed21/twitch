import { createHash, randomBytes } from "node:crypto";

import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { jwt, twoFactor } from "better-auth/plugins";
import { z } from "zod";

import type { createContextClient } from "@repo/db";

import { exceedsAbsoluteLifetime } from "../domain/absolute-lifetime.ts";

export type IdentityPrisma = ReturnType<typeof createContextClient>;

const DAY_SECONDS = 86_400;

export const IDENTITY_TOKEN_SETTINGS = {
  accessTokenExpiresIn: 900,
  refreshTokenExpiresIn: 60 * DAY_SECONDS,
  refreshTokenReuseInterval: 30,
  jwksRotationInterval: 90 * DAY_SECONDS,
  jwksGracePeriod: DAY_SECONDS,
} as const;

export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("base64url");

export const generateRefreshToken = (): string => randomBytes(32).toString("base64url");

export const apiResourceOf = (baseURL: string): string => new URL("/v1", baseURL).href;

const RefreshGrant = z.object({
  grant_type: z.literal("refresh_token"),
  refresh_token: z.string(),
});

const refuseBeyondAbsoluteLifetime = createAuthMiddleware(async (ctx) => {
  const grant = RefreshGrant.safeParse(ctx.body);
  if (!grant.success) {
    return;
  }
  const stored = await ctx.context.adapter.findOne<{ authTime: Date | null }>({
    model: "oauthRefreshToken",
    where: [{ field: "token", value: hashToken(grant.data.refresh_token) }],
  });
  if (stored !== null && exceedsAbsoluteLifetime({ authTime: stored.authTime, now: new Date() })) {
    throw new APIError("BAD_REQUEST", { error: "invalid_grant" });
  }
});

export const createIdentityAuth = ({
  prisma,
  secret,
  baseURL,
}: {
  prisma: IdentityPrisma;
  secret: string;
  baseURL: string;
}) =>
  betterAuth({
    basePath: "/auth",
    secret,
    baseURL,
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    disabledPaths: ["/token"],
    hooks: { before: refuseBeyondAbsoluteLifetime },
    emailAndPassword: { enabled: true },
    user: { modelName: "IdentityUser" },
    session: { modelName: "IdentitySession" },
    account: { modelName: "IdentityAccount" },
    verification: { modelName: "IdentityVerification" },
    plugins: [
      jwt({
        jwks: {
          rotationInterval: IDENTITY_TOKEN_SETTINGS.jwksRotationInterval,
          gracePeriod: IDENTITY_TOKEN_SETTINGS.jwksGracePeriod,
        },
        schema: { jwks: { modelName: "IdentityJwks" } },
      }),
      twoFactor({
        issuer: "Twitch",
        backupCodeOptions: { storeBackupCodes: "encrypted" },
        schema: { twoFactor: { modelName: "IdentityTwoFactor" } },
      }),
      oauthProvider({
        loginPage: "/login",
        consentPage: "/consent",
        resources: [apiResourceOf(baseURL)],
        accessTokenExpiresIn: IDENTITY_TOKEN_SETTINGS.accessTokenExpiresIn,
        refreshTokenExpiresIn: IDENTITY_TOKEN_SETTINGS.refreshTokenExpiresIn,
        refreshTokenReuseInterval: IDENTITY_TOKEN_SETTINGS.refreshTokenReuseInterval,
        generateRefreshToken,
        storeTokens: { hash: hashToken },
        schema: {
          oauthClient: { modelName: "IdentityOAuthClient" },
          oauthResource: { modelName: "IdentityOAuthResource" },
          oauthClientResource: { modelName: "IdentityOAuthClientResource" },
          oauthRefreshToken: { modelName: "IdentityOAuthRefreshToken" },
          oauthAccessToken: { modelName: "IdentityOAuthAccessToken" },
          oauthConsent: { modelName: "IdentityOAuthConsent" },
          oauthClientAssertion: { modelName: "IdentityOAuthClientAssertion" },
        },
      }),
    ],
  });

export type IdentityAuth = ReturnType<typeof createIdentityAuth>;
