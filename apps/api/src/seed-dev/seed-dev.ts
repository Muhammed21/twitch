import { randomUUID } from "node:crypto";

import { Client } from "pg";

import { createContextClient } from "@repo/db";
import { err, ok, type Result } from "@repo/result";

import {
  apiResourceOf,
  createIdentityAuth,
} from "../modules/identity/infrastructure/better-auth.ts";
import { createIdentityRedis } from "../modules/identity/infrastructure/redis-session-revocation.ts";
import { loadEnv } from "../platform/config/env.ts";

export const DEV_CLIENT_ID = "twitch-ios-dev";
export const DEV_REDIRECT_URI = "twitch://oauth/callback";
export const DEV_ACCOUNT = {
  name: "viewer_dev",
  email: "viewer@twitch.local",
  password: "twitch-dev-password",
} as const;

type Outcome = "created" | "existing";

export type SeedReport = { readonly client: Outcome; readonly account: Outcome };

type Env = Readonly<Record<string, string | undefined>>;

const migratorUrlOf = (env: Env): string => {
  const url = env.DATABASE_URL_MIGRATOR;
  if (url === undefined) {
    throw new Error("DATABASE_URL_MIGRATOR manquante : copier .env.example en .env");
  }
  return url;
};

const seedClient = async (client: Client, resource: string): Promise<Outcome> => {
  await client.query(
    `INSERT INTO "identity"."IdentityOAuthResource" ("id", "identifier", "name")
     VALUES ($1, $2, $2) ON CONFLICT ("identifier") DO NOTHING`,
    [randomUUID(), resource],
  );
  const inserted = await client.query(
    `INSERT INTO "identity"."IdentityOAuthClient"
       ("id", "clientId", "redirectUris", "tokenEndpointAuthMethod", "grantTypes", "responseTypes",
        "requirePKCE", "skipConsent", "scopes", "clientCredentialsScopes", "contacts",
        "postLogoutRedirectUris", "applicationType", "name")
     VALUES ($1, $2, $3, 'none', '["authorization_code","refresh_token"]', '["code"]',
             true, true, '["openid","profile","email","offline_access"]', '[]', '[]', '[]', 'native', 'Twitch iOS (dev)')
     ON CONFLICT ("clientId") DO NOTHING`,
    [randomUUID(), DEV_CLIENT_ID, [DEV_REDIRECT_URI]],
  );
  await client.query(
    `INSERT INTO "identity"."IdentityOAuthClientResource" ("id", "clientId", "resourceId")
     SELECT $1, $2, $3
     WHERE NOT EXISTS (
       SELECT 1 FROM "identity"."IdentityOAuthClientResource" WHERE "clientId" = $2 AND "resourceId" = $3
     )`,
    [randomUUID(), DEV_CLIENT_ID, resource],
  );
  return inserted.rowCount === 1 ? "created" : "existing";
};

const seedAccount = async (env: Env): Promise<Outcome> => {
  const config = loadEnv(env);
  const prisma = createContextClient({ context: "identity", env });
  const redis = createIdentityRedis(config.redisUrl);
  await redis.connect();
  try {
    const existing = await prisma.identityUser.findUnique({ where: { email: DEV_ACCOUNT.email } });
    if (existing !== null) {
      return "existing";
    }
    const auth = createIdentityAuth({
      prisma,
      redis,
      secret: config.authSecret,
      baseURL: config.authBaseUrl,
    });
    await auth.api.signUpEmail({ body: { ...DEV_ACCOUNT } });
    return "created";
  } finally {
    await redis.quit();
    await prisma.$disconnect();
  }
};

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);

export const seedDevelopment = async (env: Env): Promise<Result<SeedReport, "not_local">> => {
  const { authBaseUrl } = loadEnv(env);
  if (!LOOPBACK_HOSTS.has(new URL(authBaseUrl).hostname)) {
    return err("not_local");
  }
  const client = new Client({ connectionString: migratorUrlOf(env) });
  await client.connect();
  try {
    const clientOutcome = await seedClient(client, apiResourceOf(authBaseUrl));
    return ok({ client: clientOutcome, account: await seedAccount(env) });
  } finally {
    await client.end();
  }
};
