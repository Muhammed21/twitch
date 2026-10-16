import { createHash, randomBytes, randomUUID } from "node:crypto";

import { type OAuthClaimExtensionInput, oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { jwt, twoFactor, username } from "better-auth/plugins";
import { z } from "zod";

import type { createContextClient } from "@repo/db";

import { revokeAllSessions } from "../application/revoke-all-sessions.ts";
import { exceedsAbsoluteLifetime } from "../domain/absolute-lifetime.ts";
import {
  authenticationClaims,
  authenticationMethodsFor,
} from "../domain/authentication-context.ts";
import { parseBirthDate } from "../domain/birth-date.ts";
import { isRefreshTokenReuse } from "../domain/refresh-token-reuse.ts";
import { ACCESS_TOKEN_LIFETIME_SECONDS } from "../domain/token-lifetimes.ts";
import { isValidUsername, USERNAME_LENGTH } from "../domain/username.ts";
import { identityOutbox } from "./identity-outbox.ts";
import { prismaSessionRevocationStore } from "./prisma-session-revocation-store.ts";
import {
  type IdentityRedis,
  redisRevokedSessionList,
  redisSessionRevocationBroadcast,
} from "./redis-session-revocation.ts";

export type IdentityPrisma = ReturnType<typeof createContextClient>;

const DAY_SECONDS = 86_400;

export const IDENTITY_TOKEN_SETTINGS = {
  accessTokenExpiresIn: ACCESS_TOKEN_LIFETIME_SECONDS,
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

type StoredRefreshToken = {
  userId: string;
  authTime: Date | null;
  revoked: Date | null;
  rotationReplayExpiresAt: Date | null;
};

type HookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

const guardRefreshGrant =
  (onReuse: (input: { userId: string; userAgent: string | null }) => Promise<unknown>) =>
  async (ctx: HookContext) => {
    const grant = RefreshGrant.safeParse(ctx.body);
    if (!grant.success) {
      return;
    }
    const stored = await ctx.context.adapter.findOne<StoredRefreshToken>({
      model: "oauthRefreshToken",
      where: [{ field: "token", value: hashToken(grant.data.refresh_token) }],
    });
    if (stored === null) {
      return;
    }
    const now = new Date();
    if (isRefreshTokenReuse({ token: stored, now })) {
      await onReuse({ userId: stored.userId, userAgent: ctx.headers?.get("user-agent") ?? null });
      return;
    }
    if (exceedsAbsoluteLifetime({ authTime: stored.authTime, now })) {
      throw new APIError("BAD_REQUEST", { error: "invalid_grant" });
    }
  };

const SIGN_UP_PATH = "/sign-up/email";
const UPDATE_USER_PATH = "/update-user";

const BIRTH_DATE_MESSAGES = {
  missing: "La date de naissance est requise.",
  malformed: "La date de naissance doit être au format AAAA-MM-JJ.",
  future: "La date de naissance ne peut pas être dans le futur.",
  too_young: "Il faut avoir au moins 13 ans pour créer un compte.",
} as const;

const guardBirthDateUpdate = (ctx: HookContext) => {
  if (ctx.body !== undefined && "birthDate" in ctx.body) {
    throw new APIError("BAD_REQUEST", {
      code: "BIRTH_DATE_IMMUTABLE",
      message: "La date de naissance ne se modifie pas après l'inscription.",
    });
  }
};

const guardSignUpBirthDate = (ctx: HookContext) => {
  const birthDate = parseBirthDate({ value: ctx.body?.birthDate, now: new Date() });
  if (!birthDate.ok) {
    throw new APIError("BAD_REQUEST", {
      code: `BIRTH_DATE_${birthDate.error.toUpperCase()}`,
      message: BIRTH_DATE_MESSAGES[birthDate.error],
    });
  }
  return { context: { body: { ...ctx.body, birthDate: birthDate.value } } };
};

const sessionAuthenticationClaims = async ({ ctx, sessionId }: OAuthClaimExtensionInput) => {
  if (typeof sessionId !== "string") {
    return {};
  }
  const session = await ctx.context.adapter.findOne<{ createdAt: Date; amr: string[] | null }>({
    model: "session",
    where: [{ field: "id", value: sessionId }],
  });
  return session === null ? {} : authenticationClaims(session);
};

export const createIdentityAuth = ({
  prisma,
  redis,
  secret,
  baseURL,
}: {
  prisma: IdentityPrisma;
  redis: IdentityRedis;
  secret: string;
  baseURL: string;
}) => {
  const revokeAll = revokeAllSessions({
    store: prismaSessionRevocationStore(prisma),
    revokedSessions: redisRevokedSessionList(redis),
    broadcast: redisSessionRevocationBroadcast(redis),
  });
  const refreshGuard = guardRefreshGrant((input) =>
    revokeAll({ ...input, reason: "refresh_token_reuse" }),
  );
  return betterAuth({
    basePath: "/auth",
    secret,
    baseURL,
    database: prismaAdapter(prisma, { provider: "postgresql", transaction: true }),
    disabledPaths: ["/token"],
    advanced: { database: { generateId: () => randomUUID() } },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === SIGN_UP_PATH) {
          return guardSignUpBirthDate(ctx);
        }
        if (ctx.path === UPDATE_USER_PATH) {
          return guardBirthDateUpdate(ctx);
        }
        return refreshGuard(ctx);
      }),
    },
    emailAndPassword: { enabled: true },
    user: {
      modelName: "IdentityUser",
      additionalFields: { birthDate: { type: "date", required: false, input: true } },
    },
    session: {
      modelName: "IdentitySession",
      additionalFields: { amr: { type: "string[]", input: false } },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session, context) => ({
            data: { ...session, amr: [...authenticationMethodsFor(context?.path ?? "")] },
          }),
        },
      },
    },
    account: { modelName: "IdentityAccount" },
    verification: { modelName: "IdentityVerification" },
    plugins: [
      identityOutbox(),
      jwt({
        jwks: {
          rotationInterval: IDENTITY_TOKEN_SETTINGS.jwksRotationInterval,
          gracePeriod: IDENTITY_TOKEN_SETTINGS.jwksGracePeriod,
        },
        schema: { jwks: { modelName: "IdentityJwks" } },
      }),
      username({
        minUsernameLength: USERNAME_LENGTH.min,
        maxUsernameLength: USERNAME_LENGTH.max,
        usernameValidator: isValidUsername,
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
        extensions: [{ claims: { accessToken: sessionAuthenticationClaims } }],
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
};

export type IdentityAuth = ReturnType<typeof createIdentityAuth>;
