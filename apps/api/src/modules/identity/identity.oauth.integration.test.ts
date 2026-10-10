import { createHash, randomBytes, randomUUID } from "node:crypto";

import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from "jose";
import { Client } from "pg";
import { beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../create-app.ts";

const REDIRECT_URI = "twitch-ios://oauth/callback";

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

const seedPublicClient = async ({
  skipConsent = true,
}: { skipConsent?: boolean } = {}): Promise<string> => {
  const clientId = `ios-${randomUUID()}`;
  await asMigrator((client) =>
    client.query(
      `INSERT INTO "identity"."IdentityOAuthClient"
         ("id", "clientId", "redirectUris", "tokenEndpointAuthMethod", "grantTypes", "responseTypes",
          "requirePKCE", "skipConsent", "scopes", "clientCredentialsScopes", "contacts",
          "postLogoutRedirectUris", "applicationType", "name")
       VALUES ($1, $2, $3, 'none', '["authorization_code","refresh_token"]', '["code"]',
               true, $4, '["openid","profile","email","offline_access"]', '[]', '[]', '[]', 'native', 'Twitch iOS')`,
      [randomUUID(), clientId, [REDIRECT_URI], skipConsent],
    ),
  );
  await asMigrator((client) =>
    client.query(
      `INSERT INTO "identity"."IdentityOAuthClientResource" ("id", "clientId", "resourceId")
       VALUES ($1, $2, $3)`,
      [randomUUID(), clientId, API_RESOURCE],
    ),
  );
  return clientId;
};

const sessionCookieOf = async (base: string) => {
  const response = await fetch(`${base}/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: urlOf("BETTER_AUTH_URL") },
    body: JSON.stringify({
      name: "Viewer de test",
      email: `oauth-${randomUUID()}@twitch.local`,
      password: "un-mot-de-passe-solide-42",
    }),
  });
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  expect(cookie).toMatch(/session_token=/);
  return cookie;
};

const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
};

const authorizationRedirect = async (
  base: string,
  { cookie, clientId, challenge }: { cookie?: string; clientId: string; challenge: string },
) => {
  const query = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: "openid offline_access",
    state: randomUUID(),
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: API_RESOURCE,
  });
  const response = await fetch(`${base}/auth/oauth2/authorize?${query}`, {
    headers: cookie === undefined ? {} : { cookie },
    redirect: "manual",
  });
  const location = response.headers.get("location");
  return new URL(location ?? ((await response.json()) as { url: string }).url, base);
};

const authorizationCode = async (
  base: string,
  {
    cookie,
    clientId,
    challenge,
    resource,
  }: { cookie: string; clientId: string; challenge: string; resource?: string },
) => {
  const query = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: "openid offline_access",
    state: randomUUID(),
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...(resource === undefined ? {} : { resource }),
  });
  const response = await fetch(`${base}/auth/oauth2/authorize?${query}`, {
    headers: { cookie },
    redirect: "manual",
  });
  const { url } = (await response.json()) as { url: string };
  expect(url).toContain("code=");
  return new URL(url).searchParams.get("code") ?? "";
};

const token = async (base: string, body: Record<string, string>) => {
  const response = await fetch(`${base}/auth/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  return {
    status: response.status,
    body: (await response.json()) as TokenResponse & { error?: string },
  };
};

const signInDevice = async (
  base: string,
  { cookie, clientId, resource }: { cookie: string; clientId: string; resource?: string },
) => {
  const { verifier, challenge } = pkce();
  const code = await authorizationCode(base, { cookie, clientId, challenge, resource });
  const exchange = await token(base, {
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    client_id: clientId,
    code_verifier: verifier,
    ...(resource === undefined ? {} : { resource }),
  });
  expect(exchange).toMatchObject({ status: 200 });
  return exchange.body;
};

const signIn = async (
  base: string,
  options: { resource?: string } = { resource: API_RESOURCE },
) => {
  const cookie = await sessionCookieOf(base);
  const clientId = await seedPublicClient();
  const tokens = await signInDevice(base, { cookie, clientId, ...options });
  return { clientId, cookie, tokens };
};

const WITHOUT_RESOURCE = { resource: undefined };

const daysAfter = (later?: Date, earlier?: Date) =>
  Math.round(((later?.getTime() ?? 0) - (earlier?.getTime() ?? 0)) / 86_400_000);

const storedRefreshToken = async (refreshToken: string) =>
  asMigrator(async (client) => {
    const { rows } = await client.query<{ createdAt: Date; expiresAt: Date }>(
      `SELECT "createdAt", "expiresAt" FROM "identity"."IdentityOAuthRefreshToken" WHERE "token" = $1`,
      [createHash("sha256").update(refreshToken).digest("base64url")],
    );
    return rows[0];
  });

const ageRefreshToken = (refreshToken: string, days: number) =>
  asMigrator((client) =>
    client.query(
      `UPDATE "identity"."IdentityOAuthRefreshToken"
          SET "createdAt" = "createdAt" - make_interval(days => $2),
              "expiresAt" = "expiresAt" - make_interval(days => $2)
        WHERE "token" = $1`,
      [createHash("sha256").update(refreshToken).digest("base64url"), days],
    ),
  );

const expireReplayWindow = (refreshToken: string) =>
  asMigrator((client) =>
    client.query(
      `UPDATE "identity"."IdentityOAuthRefreshToken"
          SET "rotatedAt" = "rotatedAt" - interval '1 minute',
              "rotationReplayExpiresAt" = "rotationReplayExpiresAt" - interval '1 minute'
        WHERE "token" = $1`,
      [createHash("sha256").update(refreshToken).digest("base64url")],
    ),
  );

const refresh = (
  base: string,
  { clientId, refreshToken }: { clientId: string; refreshToken: string },
) =>
  token(base, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    resource: API_RESOURCE,
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

const kidOf = (jwt: string) => decodeProtectedHeader(jwt).kid ?? "";

const publishedKids = async (base: string) => {
  const { keys } = (await (await fetch(`${base}/auth/jwks`)).json()) as { keys: { kid: string }[] };
  return keys.map((key) => key.kid);
};

const expireSigningKey = (kid: string, hoursAgo: number) =>
  asMigrator((client) =>
    client.query(
      `UPDATE "identity"."IdentityJwks" SET "expiresAt" = now() - make_interval(hours => $2) WHERE "id" = $1`,
      [kid, hoursAgo],
    ),
  );

beforeAll(async () => {
  await asMigrator((client) => client.query(`DELETE FROM "identity"."IdentityOAuthResource"`));
});

describe("identity : caractérisation OAuth de l'ADR 0026, contre le vrai better-auth", () => {
  it("renvoie vers la page de connexion une autorisation sans session", async () => {
    await withApi(async (base) => {
      await sessionCookieOf(base);
      const clientId = await seedPublicClient();
      const location = await authorizationRedirect(base, { clientId, challenge: pkce().challenge });

      expect(location.pathname).toBe("/login");
    });
  });

  it("renvoie vers la page de consentement un client qui l'exige", async () => {
    await withApi(async (base) => {
      const cookie = await sessionCookieOf(base);
      const clientId = await seedPublicClient({ skipConsent: false });
      const location = await authorizationRedirect(base, {
        cookie,
        clientId,
        challenge: pkce().challenge,
      });

      expect(location.pathname).toBe("/consent");
    });
  });

  it("signe avec une clé valable 90 jours", async () => {
    await withApi(async (base) => {
      const { tokens } = await signIn(base);
      const days = await asMigrator(async (client) => {
        const { rows } = await client.query<{ days: string }>(
          `SELECT round(extract(epoch from ("expiresAt" - "createdAt")) / 86400) AS days
             FROM "identity"."IdentityJwks" WHERE "id" = $1`,
          [kidOf(tokens.access_token)],
        );
        return rows.map((row) => Number(row.days));
      });

      expect(days).toEqual([90]);
    });
  });

  it("publie encore l'ancienne clé 24 h après sa rotation, plus au-delà", async () => {
    await withApi(async (base) => {
      const before = kidOf((await signIn(base)).tokens.access_token);
      await expireSigningKey(before, 23);
      const after = kidOf((await signIn(base)).tokens.access_token);

      expect(after).not.toBe(before);
      expect(await publishedKids(base)).toEqual(expect.arrayContaining([before, after]));

      await expireSigningKey(before, 25);
      expect(await publishedKids(base)).not.toContain(before);
    });
  });

  it("émet un jeton d'accès JWT EdDSA de 900 s pour la ressource demandée, vérifiable par le JWKS", async () => {
    await withApi(async (base) => {
      const { tokens } = await signIn(base);
      const { payload } = await jwtVerify(
        tokens.access_token,
        createRemoteJWKSet(new URL(`${base}/auth/jwks`)),
        { audience: API_RESOURCE },
      );

      expect(decodeProtectedHeader(tokens.access_token).alg).toBe("EdDSA");
      expect(tokens.expires_in).toBe(900);
      expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(900);
      expect(payload.sub).toEqual(expect.any(String));
    });
  });

  it("émet un jeton d'accès opaque, sans ressource demandée", async () => {
    await withApi(async (base) => {
      const { tokens } = await signIn(base, WITHOUT_RESOURCE);

      expect(tokens.access_token.split(".")).toHaveLength(1);
    });
  });

  it("émet un jeton de rafraîchissement de 256 bits, stocké sous forme de son empreinte SHA-256", async () => {
    await withApi(async (base) => {
      const { tokens } = await signIn(base);
      const stored = await asMigrator(async (client) => {
        const { rows } = await client.query<{ token: string; expiresAt: Date; createdAt: Date }>(
          `SELECT "token", "expiresAt", "createdAt" FROM "identity"."IdentityOAuthRefreshToken"
            WHERE "token" = $1`,
          [createHash("sha256").update(tokens.refresh_token).digest("base64url")],
        );
        return rows;
      });

      expect(Buffer.from(tokens.refresh_token, "base64url")).toHaveLength(32);
      expect(stored).toHaveLength(1);
      const days =
        ((stored[0]?.expiresAt.getTime() ?? 0) - (stored[0]?.createdAt.getTime() ?? 0)) /
        86_400_000;
      expect(Math.round(days)).toBe(60);
    });
  });

  it("fait tourner le jeton de rafraîchissement à chaque usage, pour 60 jours glissants", async () => {
    await withApi(async (base) => {
      const { clientId, tokens } = await signIn(base);
      await ageRefreshToken(tokens.refresh_token, 10);
      const original = await storedRefreshToken(tokens.refresh_token);
      const rotated = await refresh(base, { clientId, refreshToken: tokens.refresh_token });
      const renewed = await storedRefreshToken(rotated.body.refresh_token);

      expect(rotated.status).toBe(200);
      expect(rotated.body.refresh_token).not.toBe(tokens.refresh_token);
      expect(daysAfter(renewed?.expiresAt, renewed?.createdAt)).toBe(60);
      expect(daysAfter(renewed?.expiresAt, original?.expiresAt)).toBe(10);
    });
  });

  it("rend la même réponse à un rejeu dans la fenêtre de 30 s, sans révoquer", async () => {
    await withApi(async (base) => {
      const { clientId, tokens } = await signIn(base);
      const first = await refresh(base, { clientId, refreshToken: tokens.refresh_token });
      const replay = await refresh(base, { clientId, refreshToken: tokens.refresh_token });
      const next = await refresh(base, { clientId, refreshToken: first.body.refresh_token });

      expect(replay.status).toBe(200);
      expect(replay.body.refresh_token).toBe(first.body.refresh_token);
      expect(next.status).toBe(200);
    });
  });

  it("refuse le rejeu d'un jeton consommé hors de la fenêtre de 30 s", async () => {
    await withApi(async (base) => {
      const { clientId, tokens } = await signIn(base);
      await refresh(base, { clientId, refreshToken: tokens.refresh_token });
      await expireReplayWindow(tokens.refresh_token);
      const replay = await refresh(base, { clientId, refreshToken: tokens.refresh_token });

      expect(replay.status).toBe(400);
      expect(replay.body.error).toBe("invalid_grant");
    });
  });

  it("révoque aussi le second appareil quand un jeton consommé est rejoué hors de la fenêtre", async () => {
    await withApi(async (base) => {
      const cookie = await sessionCookieOf(base);
      const clientId = await seedPublicClient();
      const deviceA = await signInDevice(base, { cookie, clientId, resource: API_RESOURCE });
      const deviceB = await signInDevice(base, { cookie, clientId, resource: API_RESOURCE });
      await refresh(base, { clientId, refreshToken: deviceA.refresh_token });
      await expireReplayWindow(deviceA.refresh_token);

      const replay = await refresh(base, { clientId, refreshToken: deviceA.refresh_token });
      const secondDevice = await refresh(base, { clientId, refreshToken: deviceB.refresh_token });

      expect(replay.body.error).toBe("invalid_grant");
      expect(secondDevice.status).toBe(400);
      expect(secondDevice.body.error).toBe("invalid_grant");
    });
  });

  it("n'expose pas l'endpoint /token du plugin jwt", async () => {
    await withApi(async (base) => {
      const { cookie } = await signIn(base);

      expect((await fetch(`${base}/auth/token`, { headers: { cookie } })).status).toBe(404);
    });
  });
});
