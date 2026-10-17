import { createHash, randomBytes, randomUUID } from "node:crypto";
import { networkInterfaces } from "node:os";

import { decodeJwt } from "jose";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { createApp } from "../create-app.ts";
import { DEV_ACCOUNT, DEV_CLIENT_ID, DEV_REDIRECT_URI, seedDevelopment } from "./seed-dev.ts";

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

const forgetSeed = () =>
  asMigrator(async (client) => {
    for (const table of [
      "IdentityOAuthRefreshToken",
      "IdentityOAuthAccessToken",
      "IdentityOAuthConsent",
    ]) {
      await client.query(`DELETE FROM "identity"."${table}" WHERE "clientId" = $1`, [
        DEV_CLIENT_ID,
      ]);
    }
    await client.query(`DELETE FROM "identity"."IdentityOAuthClient" WHERE "clientId" = $1`, [
      DEV_CLIENT_ID,
    ]);
    await client.query(`DELETE FROM "identity"."IdentityUser" WHERE "email" = $1`, [
      DEV_ACCOUNT.email,
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
});

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
      value: { client: "created", account: "created" },
    });
    expect(await seedDevelopment(process.env)).toEqual({
      ok: true,
      value: { client: "existing", account: "existing" },
    });
    expect(await seeded()).toEqual({ clients: 1, resources: 1, accounts: 1 });
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
    expect(await seeded()).toEqual({ clients: 0, resources: 0, accounts: 0 });
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
