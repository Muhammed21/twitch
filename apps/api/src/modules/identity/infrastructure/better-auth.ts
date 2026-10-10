import { createHash, randomBytes } from "node:crypto";

import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { jwt } from "better-auth/plugins";

import type { createContextClient } from "@repo/db";

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
