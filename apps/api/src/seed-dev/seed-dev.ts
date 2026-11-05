import { randomUUID } from "node:crypto";
import { networkInterfaces } from "node:os";

import { Client } from "pg";
import type { z } from "zod";

import { events } from "@repo/contracts";
import { appendToOutbox, createContextClient } from "@repo/db";
import { err, ok, type Result } from "@repo/result";

import { createAuthzRedis, invalidateAssignments } from "../authz/authz-context.ts";
import {
  parseCategoryName,
  parseCategorySlug,
  parseCategoryTags,
} from "../modules/channel/domain/category.ts";
import { prismaCategoryCatalog } from "../modules/channel/infrastructure/prisma-category-catalog.ts";
import {
  apiResourceOf,
  createIdentityAuth,
} from "../modules/identity/infrastructure/better-auth.ts";
import { createIdentityRedis } from "../modules/identity/infrastructure/redis-session-revocation.ts";
import { createSmtpMailer } from "../modules/identity/infrastructure/smtp-mailer.ts";
import { loadEnv } from "../platform/config/env.ts";
import { isLocalHost } from "./local-host.ts";

export const DEV_CLIENT_ID = "twitch-ios-dev";
export const DEV_REDIRECT_URI = "twitch://oauth/callback";
export const DEV_ACCOUNT = {
  name: "viewer_dev",
  username: "viewer_dev",
  email: "viewer@twitch.local",
  password: "twitch-dev-password",
  birthDate: new Date("2000-01-01T00:00:00.000Z"),
} as const;

export const ADMIN_CLIENT_ID = "twitch-admin-dev";
export const ADMIN_REDIRECT_URI = "http://127.0.0.1/callback";
export const ADMIN_ACCOUNT = {
  name: "admin_dev",
  username: "admin_dev",
  email: "admin@twitch.local",
  password: "twitch-admin-password",
  birthDate: new Date("2000-01-01T00:00:00.000Z"),
} as const;

export const DEV_CATEGORIES = [
  { slug: "just-chatting", name: "Just Chatting", tags: ["IRL"] },
  { slug: "league-of-legends", name: "League of Legends", tags: ["MOBA", "Strategy"] },
  { slug: "valorant", name: "Valorant", tags: ["FPS", "Shooter"] },
  { slug: "minecraft", name: "Minecraft", tags: ["Simulation", "Adventure"] },
  { slug: "fortnite", name: "Fortnite", tags: ["Shooter", "RPG"] },
  { slug: "gta-v", name: "GTA V", tags: ["Action", "Adventure"] },
  { slug: "counter-strike", name: "Counter-Strike", tags: ["FPS", "Shooter"] },
  { slug: "music", name: "Music", tags: ["Creative", "Music"] },
  { slug: "art", name: "Art", tags: ["Creative"] },
  { slug: "irl", name: "IRL", tags: ["IRL"] },
] as const;

const DEMO_CATEGORY = "just-chatting";

type Outcome = "created" | "existing";

export type SeedReport = {
  readonly client: Outcome;
  readonly account: Outcome;
  readonly adminClient: Outcome;
  readonly adminAccount: Outcome;
  readonly categories: number;
  readonly channels: number;
};

type OAuthClientSeed = {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly scopes: readonly string[];
  readonly name: string;
};

type AccountSeed = typeof DEV_ACCOUNT | typeof ADMIN_ACCOUNT;

const IOS_CLIENT: OAuthClientSeed = {
  clientId: DEV_CLIENT_ID,
  redirectUri: DEV_REDIRECT_URI,
  scopes: ["openid", "profile", "email", "offline_access"],
  name: "Twitch iOS (dev)",
};

const ADMIN_CLIENT: OAuthClientSeed = {
  clientId: ADMIN_CLIENT_ID,
  redirectUri: ADMIN_REDIRECT_URI,
  scopes: ["openid", "profile", "email", "offline_access", "admin:category.manage"],
  name: "Twitch admin (dev)",
};

type Env = Readonly<Record<string, string | undefined>>;

const migratorUrlOf = (env: Env): string => {
  const url = env.DATABASE_URL_MIGRATOR;
  if (url === undefined) {
    throw new Error("DATABASE_URL_MIGRATOR manquante : copier .env.example en .env");
  }
  return url;
};

const seedClient = async (
  client: Client,
  resource: string,
  seed: OAuthClientSeed,
): Promise<Outcome> => {
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
             true, true, $4, '[]', '[]', '[]', 'native', $5)
     ON CONFLICT ("clientId") DO NOTHING`,
    [randomUUID(), seed.clientId, [seed.redirectUri], JSON.stringify(seed.scopes), seed.name],
  );
  await client.query(
    `INSERT INTO "identity"."IdentityOAuthClientResource" ("id", "clientId", "resourceId")
     SELECT $1, $2, $3
     WHERE NOT EXISTS (
       SELECT 1 FROM "identity"."IdentityOAuthClientResource" WHERE "clientId" = $2 AND "resourceId" = $3
     )`,
    [randomUUID(), seed.clientId, resource],
  );
  return inserted.rowCount === 1 ? "created" : "existing";
};

const seedAccount = async (env: Env, account: AccountSeed): Promise<Outcome> => {
  const config = loadEnv(env);
  const prisma = createContextClient({ context: "identity", env });
  const redis = createIdentityRedis(config.redisUrl);
  await redis.connect();
  try {
    const existing = await prisma.identityUser.findUnique({ where: { email: account.email } });
    if (existing !== null) {
      return "existing";
    }
    const auth = createIdentityAuth({
      prisma,
      redis,
      secret: config.authSecret,
      baseURL: config.authBaseUrl,
      mailer: createSmtpMailer(config.smtp),
    });
    await auth.api.signUpEmail({ body: { ...account } });
    return "created";
  } finally {
    await redis.quit();
    await prisma.$disconnect();
  }
};

const withContext = async <T>(
  env: Env,
  context: "identity" | "channel",
  run: (prisma: ReturnType<typeof createContextClient>) => Promise<T>,
): Promise<T> => {
  const prisma = createContextClient({ context, env });
  try {
    return await run(prisma);
  } finally {
    await prisma.$disconnect();
  }
};

const userIdsOf = (env: Env, emails: readonly string[]) =>
  withContext(env, "identity", async (prisma) =>
    (
      await prisma.identityUser.findMany({
        where: { email: { in: [...emails] } },
        select: { id: true, email: true },
        take: emails.length,
      })
    ).map(({ id, email }) => ({ id, email })),
  );

const grantPlatformAdmin = async (env: Env, client: Client, userId: string): Promise<void> => {
  const { rowCount } = await client.query(
    `INSERT INTO "authz"."AuthzRoleAssignment"
       ("id", "subjectId", "role", "scopeType", "scopeId", "grantedBy")
     SELECT $1, $2, 'admin', 'platform', 'platform', 'seed-dev'
     WHERE NOT EXISTS (
       SELECT 1 FROM "authz"."AuthzRoleAssignment"
        WHERE "subjectId" = $2 AND "role" = 'admin' AND "scopeType" = 'platform'
          AND "revokedAt" IS NULL
     )`,
    [randomUUID(), userId],
  );
  if (rowCount === 0) {
    return;
  }
  const redis = createAuthzRedis(loadEnv(env).redisUrl);
  await redis.connect();
  try {
    await invalidateAssignments({ redis, userId });
  } finally {
    await redis.quit();
  }
};

const devCategory = ({ slug, name, tags }: (typeof DEV_CATEGORIES)[number]) => {
  const parsedSlug = parseCategorySlug(slug);
  const parsedName = parseCategoryName(name);
  const parsedTags = parseCategoryTags(tags);
  if (!parsedSlug.ok || !parsedName.ok || !parsedTags.ok) {
    throw new Error(`catégorie de seed invalide : ${slug}`);
  }
  return { slug: parsedSlug.value, name: parsedName.value, tags: parsedTags.value };
};

const sameTags = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((tag, index) => tag === right[index]);

const seedCategories = (env: Env): Promise<number> =>
  withContext(env, "channel", async (prisma) => {
    const catalog = prismaCategoryCatalog(prisma);
    const outcomes = await DEV_CATEGORIES.reduce<Promise<readonly boolean[]>>(
      async (previous, category) => {
        const done = await previous;
        const { slug, name, tags } = devCategory(category);
        const created = await catalog.create({
          slug,
          name,
          categoryId: randomUUID(),
          outboxEventId: randomUUID(),
          occurredAt: new Date(),
        });
        const current = await catalog.findBySlug(slug);
        if (current !== null && !sameTags(current.tags, tags)) {
          const tagged = await catalog.changeTags({
            categoryId: current.id,
            tags,
            outboxEventId: randomUUID(),
            occurredAt: new Date(),
          });
          if (!tagged.ok) {
            throw new Error(`tags de la catégorie ${slug} inchangés : ${tagged.error}`);
          }
        }
        return [...done, created.ok];
      },
      Promise.resolve([]),
    );
    return outcomes.filter(Boolean).length;
  });

const { channelMetadataUpdated } = events.channel;

const categorizeDemoChannels = (env: Env, ownerIds: readonly string[]): Promise<number> =>
  withContext(env, "channel", (prisma) =>
    prisma.$transaction(async (tx) => {
      const category = await tx.channelCategory.findUnique({
        where: { slug: DEMO_CATEGORY },
        select: { id: true },
      });
      if (category === null) {
        return 0;
      }
      const channels = await tx.channel.findMany({
        where: { ownerId: { in: [...ownerIds] }, categoryId: null },
        select: { id: true, title: true },
        take: ownerIds.length,
      });
      await tx.channel.updateMany({
        where: { id: { in: channels.map(({ id }) => id) } },
        data: { categoryId: category.id },
      });
      await channels.reduce(async (previous, { id, title }) => {
        await previous;
        await appendToOutbox(tx, {
          outbox: { schema: "channel", table: "ChannelOutbox" },
          event: {
            id: randomUUID(),
            name: channelMetadataUpdated.name,
            version: channelMetadataUpdated.version,
            payload: { channelId: id, title, categoryId: category.id } satisfies z.input<
              typeof channelMetadataUpdated.payload
            >,
            occurredAt: new Date(),
          },
        });
      }, Promise.resolve());
      return channels.length;
    }),
  );

const machineAddresses = (): readonly string[] =>
  Object.values(networkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .map(({ address }) => address);

export const seedDevelopment = async (env: Env): Promise<Result<SeedReport, "not_local">> => {
  const { authBaseUrl } = loadEnv(env);
  if (
    !isLocalHost({ hostname: new URL(authBaseUrl).hostname, machineAddresses: machineAddresses() })
  ) {
    return err("not_local");
  }
  const client = new Client({ connectionString: migratorUrlOf(env) });
  await client.connect();
  try {
    const resource = apiResourceOf(authBaseUrl);
    const clientOutcome = await seedClient(client, resource, IOS_CLIENT);
    const adminClient = await seedClient(client, resource, ADMIN_CLIENT);
    const account = await seedAccount(env, DEV_ACCOUNT);
    const adminAccount = await seedAccount(env, ADMIN_ACCOUNT);
    const users = await userIdsOf(env, [DEV_ACCOUNT.email, ADMIN_ACCOUNT.email]);
    const admin = users.find(({ email }) => email === ADMIN_ACCOUNT.email);
    if (admin !== undefined) {
      await grantPlatformAdmin(env, client, admin.id);
    }
    const categories = await seedCategories(env);
    const channels = await categorizeDemoChannels(
      env,
      users.map(({ id }) => id),
    );
    return ok({ client: clientOutcome, account, adminClient, adminAccount, categories, channels });
  } finally {
    await client.end();
  }
};
