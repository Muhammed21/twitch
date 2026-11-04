import { createHash, randomBytes, randomUUID } from "node:crypto";
import { networkInterfaces } from "node:os";

import { decodeJwt } from "jose";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { createApp } from "../create-app.ts";
import {
  ADMIN_ACCOUNT,
  ADMIN_CLIENT_ID,
  ADMIN_REDIRECT_URI,
  DEV_ACCOUNT,
  DEV_CATEGORIES,
  DEV_CLIENT_ID,
  DEV_REDIRECT_URI,
  seedDevelopment,
} from "./seed-dev.ts";

const urlOf = (variable: string): string => {
  const url = process.env[variable];
  if (url === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return url;
};

const API_RESOURCE = new URL("/v1", urlOf("BETTER_AUTH_URL")).href;

const asMigrator = async <T>(run: (client: Client) => Promise<T>): Promise<T> => {
  const client = new Client({ connectionString: urlOf("DATABASE_URL_MIGRATOR") });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
};

const SEEDED_CLIENTS = [DEV_CLIENT_ID, ADMIN_CLIENT_ID];
const SEEDED_EMAILS = [DEV_ACCOUNT.email, ADMIN_ACCOUNT.email];

const forgetSeed = () =>
  asMigrator(async (client) => {
    for (const table of [
      "IdentityOAuthRefreshToken",
      "IdentityOAuthAccessToken",
      "IdentityOAuthConsent",
      "IdentityOAuthClient",
    ]) {
      await client.query(`DELETE FROM "identity"."${table}" WHERE "clientId" = ANY($1)`, [
        SEEDED_CLIENTS,
      ]);
    }
    await client.query(
      `DELETE FROM "authz"."AuthzRoleAssignment" WHERE "subjectId" IN (
         SELECT "id" FROM "identity"."IdentityUser" WHERE "email" = ANY($1))`,
      [SEEDED_EMAILS],
    );
    await client.query(`DELETE FROM "identity"."IdentityUser" WHERE "email" = ANY($1)`, [
      SEEDED_EMAILS,
    ]);
    await client.query(`DELETE FROM "identity"."IdentityOAuthResource" WHERE "identifier" = $1`, [
      API_RESOURCE,
    ]);
  });

const countOf = (sql: string, values: readonly string[]) =>
  asMigrator(async (client) => {
    const { rows } = await client.query<{ count: string }>(sql, [...values]);
    return Number(rows[0]?.count);
  });

const seeded = async () => ({
  clients: await countOf(
    `SELECT count(*) FROM "identity"."IdentityOAuthClient" WHERE "clientId" = $1`,
    [DEV_CLIENT_ID],
  ),
  resources: await countOf(
    `SELECT count(*) FROM "identity"."IdentityOAuthClientResource" WHERE "clientId" = $1 AND "resourceId" = $2`,
    [DEV_CLIENT_ID, API_RESOURCE],
  ),
  accounts: await countOf(`SELECT count(*) FROM "identity"."IdentityUser" WHERE "email" = $1`, [
    DEV_ACCOUNT.email,
  ]),
  adminClients: await countOf(
    `SELECT count(*) FROM "identity"."IdentityOAuthClient" WHERE "clientId" = $1`,
    [ADMIN_CLIENT_ID],
  ),
  admins: await countOf(
    `SELECT count(*) FROM "authz"."AuthzRoleAssignment" r
       JOIN "identity"."IdentityUser" u ON u."id" = r."subjectId"
      WHERE u."email" = $1 AND r."role" = 'admin' AND r."scopeType" = 'platform'
        AND r."revokedAt" IS NULL`,
    [ADMIN_ACCOUNT.email],
  ),
});

const userIdOf = (email: string) =>
  asMigrator(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `SELECT "id" FROM "identity"."IdentityUser" WHERE "email" = $1`,
      [email],
    );
    const [row] = rows;
    if (row === undefined) {
      throw new Error(`compte ${email} absent`);
    }
    return row.id;
  });

const uncategorizedChannelOf = (ownerId: string) =>
  asMigrator(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO "channel"."Channel" ("id", "ownerId", "slug", "title")
       VALUES ($1, $2, $3, 'Démo')
       ON CONFLICT ("ownerId") DO UPDATE SET "categoryId" = NULL
       RETURNING "id"`,
      [randomUUID(), ownerId, `demo_${randomUUID().replaceAll("-", "").slice(0, 12)}`],
    );
    const [row] = rows;
    if (row === undefined) {
      throw new Error("chaîne de démo absente");
    }
    return row.id;
  });

const signedInCookie = async (base: string, account: { email: string; password: string }) => {
  const signIn = await fetch(`${base}/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: urlOf("BETTER_AUTH_URL") },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  return signIn.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
};

const withApi = async (run: (base: string) => Promise<void>) => {
  const { app } = await createApp({ env: process.env, logSink: () => {} });
  await app.listen(0, "127.0.0.1");
  try {
    await run(await app.getUrl());
  } finally {
    await app.close();
  }
};

const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};

describe("seed de développement (ADR 0039, §6)", () => {
  it("enregistre le client iOS, son lien vers /v1 et le compte de test, puis ne crée rien au second passage", async () => {
    await forgetSeed();

    expect(await seedDevelopment(process.env)).toEqual({
      ok: true,
      value: {
        client: "created",
        account: "created",
        adminClient: "created",
        adminAccount: "created",
        categories: expect.any(Number),
        channels: expect.any(Number),
      },
    });
    expect(await seedDevelopment(process.env)).toEqual({
      ok: true,
      value: {
        client: "existing",
        account: "existing",
        adminClient: "existing",
        adminAccount: "existing",
        categories: 0,
        channels: expect.any(Number),
      },
    });
    expect(await seeded()).toEqual({
      clients: 1,
      resources: 1,
      accounts: 1,
      adminClients: 1,
      admins: 1,
    });
  });

  it("donne au client iOS et au compte de test un token /v1 par PKCE, avec la redirection twitch://", async () => {
    await seedDevelopment(process.env);

    await withApi(async (base) => {
      const signIn = await fetch(`${base}/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: urlOf("BETTER_AUTH_URL") },
        body: JSON.stringify({ email: DEV_ACCOUNT.email, password: DEV_ACCOUNT.password }),
      });
      const cookie = signIn.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .join("; ");
      const { verifier, challenge } = pkce();
      const authorize = await fetch(
        `${base}/auth/oauth2/authorize?${new URLSearchParams({
          response_type: "code",
          client_id: DEV_CLIENT_ID,
          redirect_uri: DEV_REDIRECT_URI,
          scope: "openid profile email offline_access",
          state: randomUUID(),
          code_challenge: challenge,
          code_challenge_method: "S256",
          resource: API_RESOURCE,
        })}`,
        { headers: { cookie }, redirect: "manual" },
      );
      const { url } = (await authorize.json()) as { url: string };
      const callback = new URL(url);
      const exchange = await fetch(`${base}/auth/oauth2/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: callback.searchParams.get("code") ?? "",
          redirect_uri: DEV_REDIRECT_URI,
          client_id: DEV_CLIENT_ID,
          code_verifier: verifier,
          resource: API_RESOURCE,
        }),
      });
      const { access_token } = (await exchange.json()) as { access_token: string };

      expect(`${callback.protocol}//${callback.host}${callback.pathname}`).toBe(DEV_REDIRECT_URI);
      expect(exchange.status).toBe(200);
      expect(decodeJwt(access_token).aud).toContain(API_RESOURCE);
    });
  });

  it("crée les dix catégories de Browse, actives, avec leurs tags, chacune annoncée une seule fois", async () => {
    await seedDevelopment(process.env);
    await seedDevelopment(process.env);
    const slugs = DEV_CATEGORIES.map(({ slug }) => slug);

    const { categories, announced, tagged } = await asMigrator(async (client) => ({
      categories: (
        await client.query<{ slug: string; name: string; status: string; tags: string[] }>(
          `SELECT "slug", "name", "status"::text AS "status", "tags" FROM "channel"."ChannelCategory"
            WHERE "slug" = ANY($1) ORDER BY "slug"`,
          [slugs],
        )
      ).rows,
      announced: (
        await client.query<{ slug: string }>(
          `SELECT DISTINCT "payload"->>'slug' AS "slug" FROM "channel"."ChannelOutbox"
            WHERE "name" = 'channel.category.created' AND "payload"->>'slug' = ANY($1)`,
          [slugs],
        )
      ).rows,
      tagged: (
        await client.query<{ slug: string; count: string }>(
          `SELECT o."payload"->>'categoryId' AS "categoryId", count(*)::text AS "count"
             FROM "channel"."ChannelOutbox" o
             JOIN "channel"."ChannelCategory" c ON c."id"::text = o."payload"->>'categoryId'
            WHERE o."name" = 'channel.category.updated' AND c."slug" = ANY($1)
              AND o."payload"->'tags' = to_jsonb(c."tags")
            GROUP BY 1`,
          [slugs],
        )
      ).rows,
    }));

    expect(slugs).toHaveLength(10);
    expect(categories).toEqual(
      DEV_CATEGORIES.map(({ slug, name, tags }) => ({
        slug,
        name,
        status: "active",
        tags,
      })).toSorted((left, right) => left.slug.localeCompare(right.slug)),
    );
    expect(announced).toHaveLength(10);
    expect(DEV_CATEGORIES.every(({ tags }) => tags.length > 0)).toBe(true);
    expect(tagged.map(({ count }) => count)).toEqual(Array.from({ length: 10 }, () => "1"));
  });

  it("donne sa catégorie à la chaîne de démo du compte de test, une seule fois, par channel.metadata.updated", async () => {
    await seedDevelopment(process.env);
    const channelId = await uncategorizedChannelOf(await userIdOf(DEV_ACCOUNT.email));
    const since = new Date();

    expect((await seedDevelopment(process.env)).ok).toBe(true);
    expect((await seedDevelopment(process.env)).ok).toBe(true);

    const { categoryId, events, justChatting } = await asMigrator(async (client) => ({
      categoryId: (
        await client.query<{ categoryId: string }>(
          `SELECT "categoryId"::text AS "categoryId" FROM "channel"."Channel" WHERE "id" = $1`,
          [channelId],
        )
      ).rows[0]?.categoryId,
      justChatting: (
        await client.query<{ id: string }>(
          `SELECT "id"::text AS "id" FROM "channel"."ChannelCategory" WHERE "slug" = 'just-chatting'`,
        )
      ).rows[0]?.id,
      events: (
        await client.query<{ payload: unknown }>(
          `SELECT "payload" FROM "channel"."ChannelOutbox"
            WHERE "name" = 'channel.metadata.updated' AND "payload"->>'channelId' = $1
              AND "occurredAt" >= ($2::timestamptz AT TIME ZONE 'UTC')`,
          [channelId, since.toISOString()],
        )
      ).rows,
    }));

    expect(categoryId).toBe(justChatting);
    expect(events).toEqual([{ payload: { channelId, title: "Démo", categoryId: justChatting } }]);
  });

  it("donne au compte d'administration un token qui crée une catégorie", async () => {
    await forgetSeed();
    await seedDevelopment(process.env);
    const slug = `seed-${randomUUID().slice(0, 8)}`;

    await withApi(async (base) => {
      const cookie = await signedInCookie(base, ADMIN_ACCOUNT);
      const { verifier, challenge } = pkce();
      const authorize = await fetch(
        `${base}/auth/oauth2/authorize?${new URLSearchParams({
          response_type: "code",
          client_id: ADMIN_CLIENT_ID,
          redirect_uri: ADMIN_REDIRECT_URI,
          scope: "openid admin:category.manage",
          state: randomUUID(),
          code_challenge: challenge,
          code_challenge_method: "S256",
          resource: API_RESOURCE,
        })}`,
        { headers: { cookie }, redirect: "manual" },
      );
      const { url } = (await authorize.json()) as { url: string };
      const exchange = await fetch(`${base}/auth/oauth2/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: new URL(url).searchParams.get("code") ?? "",
          redirect_uri: ADMIN_REDIRECT_URI,
          client_id: ADMIN_CLIENT_ID,
          code_verifier: verifier,
          resource: API_RESOURCE,
        }),
      });
      const { access_token } = (await exchange.json()) as { access_token: string };

      const created = await fetch(`${base}/v1/admin/categories`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${access_token}` },
        body: JSON.stringify({ slug, name: "Seed" }),
      });

      expect(exchange.status).toBe(200);
      expect(created.status).toBe(201);
    });
    await asMigrator((client) =>
      client.query(`DELETE FROM "channel"."ChannelCategory" WHERE "slug" = $1`, [slug]),
    );
  });

  it("connecte le compte de test par son nom d'utilisateur", async () => {
    await forgetSeed();
    await seedDevelopment(process.env);

    await withApi(async (base) => {
      const signIn = await fetch(`${base}/auth/sign-in/username`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: urlOf("BETTER_AUTH_URL") },
        body: JSON.stringify({ username: DEV_ACCOUNT.username, password: DEV_ACCOUNT.password }),
      });

      expect(DEV_ACCOUNT.username).toBe("viewer_dev");
      expect(signIn.status).toBe(200);
    });
  });

  it("s'arrête en nommant DATABASE_URL_MIGRATOR quand elle manque", async () => {
    await expect(
      seedDevelopment({ ...process.env, DATABASE_URL_MIGRATOR: undefined }),
    ).rejects.toThrow("DATABASE_URL_MIGRATOR manquante");
  });

  it.each([
    ["une API publique", "https://api.twitch.example"],
    ["une base de staging sur le réseau", "http://10.0.0.12:3000"],
    ["un nom qui contient localhost", "http://localhost.twitch.example"],
  ])("refuse de tourner contre %s, sans rien écrire", async (_name, url) => {
    await forgetSeed();

    expect(await seedDevelopment({ ...process.env, BETTER_AUTH_URL: url })).toEqual({
      ok: false,
      error: "not_local",
    });
    expect(await seeded()).toEqual({
      clients: 0,
      resources: 0,
      accounts: 0,
      adminClients: 0,
      admins: 0,
    });
  });

  it.each(["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"])(
    "accepte une API locale (%s)",
    async (url) => {
      expect((await seedDevelopment({ ...process.env, BETTER_AUTH_URL: url })).ok).toBe(true);
    },
  );

  it("accepte l'adresse de ce poste sur le réseau local, pour tester depuis un iPhone", async () => {
    const lanAddress = Object.values(networkInterfaces())
      .flatMap((addresses) => addresses ?? [])
      .find(({ family, internal }) => family === "IPv4" && !internal)?.address;

    expect(lanAddress).toBeDefined();
    expect(
      (await seedDevelopment({ ...process.env, BETTER_AUTH_URL: `http://${lanAddress}:3000` })).ok,
    ).toBe(true);
  });
});
