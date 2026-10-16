import { createHash, randomBytes, randomUUID } from "node:crypto";

import { createRemoteJWKSet, decodeJwt, decodeProtectedHeader, jwtVerify } from "jose";
import { Client } from "pg";
import { createClient } from "redis";
import { beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../create-app.ts";

const REDIRECT_URI = "twitch-ios://oauth/callback";

const USER_AGENT = "Twitch-iOS/1.0 (test)";

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
      birthDate: "2000-01-01",
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
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": USER_AGENT },
    body: new URLSearchParams(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: (text === "" ? {} : JSON.parse(text)) as TokenResponse & { error?: string },
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
    const { rows } = await client.query<{
      createdAt: Date;
      expiresAt: Date;
      authTime: Date | null;
      revoked: Date | null;
      rotatedAt: Date | null;
    }>(
      `SELECT "createdAt", "expiresAt", "authTime", "revoked", "rotatedAt" FROM "identity"."IdentityOAuthRefreshToken" WHERE "token" = $1`,
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

const storedReplayResponse = async (refreshToken: string) =>
  asMigrator(async (client) => {
    const { rows } = await client.query<{ rotationReplayResponse: string | null }>(
      `SELECT "rotationReplayResponse" FROM "identity"."IdentityOAuthRefreshToken" WHERE "token" = $1`,
      [createHash("sha256").update(refreshToken).digest("base64url")],
    );
    return rows[0]?.rotationReplayResponse;
  });

const ageAuthentication = (refreshToken: string, days: number) =>
  asMigrator((client) =>
    client.query(
      `UPDATE "identity"."IdentityOAuthRefreshToken"
          SET "authTime" = "authTime" - make_interval(days => $2)
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

const REVOCATION_CHANNEL = "identity.session.revoked";

const revokedSidKey = (sid: string) => `identity:revoked-sid:${sid}`;

const connectRedis = () => createClient({ url: urlOf("REDIS_URL") }).connect();

const withRedis = async <T>(
  run: (redis: Awaited<ReturnType<typeof connectRedis>>) => Promise<T>,
) => {
  const redis = await connectRedis();
  try {
    return await run(redis);
  } finally {
    redis.destroy();
  }
};

const listenForRevocations = async () => {
  const subscriber = await connectRedis();
  const received: unknown[] = [];
  await subscriber.subscribe(REVOCATION_CHANNEL, (message) => {
    received.push(JSON.parse(message));
  });
  return {
    received,
    close: () => subscriber.destroy(),
  };
};

const identityOf = (accessToken: string) => {
  const { sub, sid } = decodeJwt(accessToken);
  return { userId: String(sub), sid: String(sid) };
};

const auditEntriesOf = (userId: string) =>
  asMigrator(async (client) => {
    const { rows } = await client.query<{
      action: string;
      actorId: string;
      reason: string | null;
      userAgent: string | null;
      stateAfter: unknown;
    }>(
      `SELECT "action", "actorId", "reason", "userAgent", "stateAfter"
         FROM "audit"."AuditEntry" WHERE "targetId" = $1`,
      [userId],
    );
    return rows;
  });

const sessionAuthTime = (sid: string) =>
  asMigrator(async (client) => {
    const { rows } = await client.query<{ epoch: number }>(
      `SELECT floor(extract(epoch FROM "createdAt"))::integer AS "epoch"
         FROM "identity"."IdentitySession" WHERE "id" = $1`,
      [sid],
    );
    return rows[0]?.epoch;
  });

const deleteSession = (sid: string) =>
  asMigrator((client) =>
    client.query(`DELETE FROM "identity"."IdentitySession" WHERE "id" = $1`, [sid]),
  );

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const me = async (base: string, accessToken?: string) => {
  const response = await fetch(`${base}/v1/me`, {
    headers: accessToken === undefined ? {} : { authorization: `Bearer ${accessToken}` },
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
};

const webSessionOf = async (base: string, cookie: string) =>
  (await fetch(`${base}/auth/get-session`, { headers: { cookie } })).json();

const withApi = async (
  run: (base: string) => Promise<void>,
  {
    env = {},
    logSink = () => {},
  }: { env?: Record<string, string>; logSink?: (line: string) => void } = {},
) => {
  const { app } = await createApp({ env: { ...process.env, ...env }, logSink });
  await app.listen(0, "127.0.0.1");
  try {
    await run(await app.getUrl());
  } finally {
    await app.close();
  }
};

const kidOf = (jwt: string) => decodeProtectedHeader(jwt).kid ?? "";

const publishedKids = async (base: string) => {
  const { keys } = (await (await fetch(`${base}/.well-known/jwks.json`)).json()) as {
    keys: { kid: string }[];
  };
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
  await asMigrator((client) => client.query(`DELETE FROM "identity"."IdentityJwks"`));
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
        createRemoteJWKSet(new URL(`${base}/.well-known/jwks.json`)),
        { audience: API_RESOURCE },
      );

      expect(decodeProtectedHeader(tokens.access_token)).toMatchObject({
        alg: "EdDSA",
        typ: "at+jwt",
      });
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

  it("porte l'heure et la méthode d'authentification de la session dans le jeton d'accès", async () => {
    await withApi(async (base) => {
      const { tokens } = await signIn(base);
      const { sid } = identityOf(tokens.access_token);
      const authTime = await sessionAuthTime(sid);

      expect(authTime).toEqual(expect.any(Number));
      expect(decodeJwt(tokens.access_token)).toMatchObject({
        twitch_auth_time: authTime,
        twitch_amr: ["pwd"],
      });
    });
  });

  it("refuse qu'un client réécrive les méthodes d'authentification de sa session", async () => {
    await withApi(async (base) => {
      const { clientId, cookie, tokens } = await signIn(base);
      await fetch(`${base}/auth/update-session`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: urlOf("BETTER_AUTH_URL"),
          cookie,
        },
        body: JSON.stringify({ amr: ["pwd", "otp", "mfa"] }),
      });
      const rotated = await refresh(base, { clientId, refreshToken: tokens.refresh_token });

      expect(decodeJwt(rotated.body.access_token)).toMatchObject({ twitch_amr: ["pwd"] });
    });
  });

  it("garde l'heure et la méthode d'authentification après une rotation", async () => {
    await withApi(async (base) => {
      const { clientId, tokens } = await signIn(base);
      const rotated = await refresh(base, { clientId, refreshToken: tokens.refresh_token });
      const { twitch_auth_time, twitch_amr } = decodeJwt(tokens.access_token);

      expect(decodeJwt(rotated.body.access_token)).toMatchObject({ twitch_auth_time, twitch_amr });
    });
  });

  it("n'émet pas les claims d'authentification quand la session n'existe plus", async () => {
    await withApi(async (base) => {
      const { clientId, tokens } = await signIn(base);
      await deleteSession(identityOf(tokens.access_token).sid);
      const rotated = await refresh(base, { clientId, refreshToken: tokens.refresh_token });

      expect(rotated.status).toBe(200);
      expect(decodeJwt(rotated.body.access_token)).not.toHaveProperty("twitch_auth_time");
      expect(decodeJwt(rotated.body.access_token)).not.toHaveProperty("twitch_amr");
    });
  });

  it("garde l'heure d'authentification d'origine à chaque rotation", async () => {
    await withApi(async (base) => {
      const { clientId, tokens } = await signIn(base);
      const original = await storedRefreshToken(tokens.refresh_token);
      const rotated = await refresh(base, { clientId, refreshToken: tokens.refresh_token });
      const renewed = await storedRefreshToken(rotated.body.refresh_token);

      expect(original?.authTime).toEqual(expect.any(Date));
      expect(renewed?.authTime).toEqual(original?.authTime);
    });
  });

  it("rafraîchit encore une session authentifiée il y a 179 jours", async () => {
    await withApi(async (base) => {
      const { clientId, tokens } = await signIn(base);
      await ageAuthentication(tokens.refresh_token, 179);
      const rotated = await refresh(base, { clientId, refreshToken: tokens.refresh_token });

      expect(rotated.status).toBe(200);
    });
  });

  it("refuse le rafraîchissement d'une session authentifiée il y a plus de 180 jours", async () => {
    await withApi(async (base) => {
      const { clientId, tokens } = await signIn(base);
      await ageAuthentication(tokens.refresh_token, 181);
      const refused = await refresh(base, { clientId, refreshToken: tokens.refresh_token });
      const stored = await storedRefreshToken(tokens.refresh_token);

      expect(refused.status).toBe(400);
      expect(refused.body.error).toBe("invalid_grant");
      expect(stored).toMatchObject({ revoked: null, rotatedAt: null });
    });
  });

  it("publie le JWKS de better-auth à la racine, sous /.well-known/jwks.json", async () => {
    await withApi(async (base) => {
      await signIn(base);
      const relayed = await fetch(`${base}/.well-known/jwks.json`);
      const source = await fetch(`${base}/auth/jwks`);

      expect(relayed.status).toBe(200);
      expect(relayed.headers.get("content-type")).toMatch(/^application\/json/);
      expect(await relayed.json()).toEqual(await source.json());
    });
  });

  it("garde la réponse rejouable chiffrée en base, sans jeton en clair", async () => {
    await withApi(async (base) => {
      const { clientId, tokens } = await signIn(base);
      const first = await refresh(base, { clientId, refreshToken: tokens.refresh_token });
      const stored = await storedReplayResponse(tokens.refresh_token);

      expect(stored).toEqual(expect.any(String));
      expect(stored).not.toContain(first.body.refresh_token);
      expect(stored).not.toContain(first.body.access_token);
      expect(stored).not.toContain("refresh_token");
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

  it("réagit à un jeton consommé rejoué hors de la fenêtre : sid révoqués, publication, sessions web, audit", async () => {
    await withApi(async (base) => {
      const { clientId, cookie, tokens } = await signIn(base);
      const { userId, sid } = identityOf(tokens.access_token);
      const revocations = await listenForRevocations();
      await refresh(base, { clientId, refreshToken: tokens.refresh_token });
      await expireReplayWindow(tokens.refresh_token);
      const replay = await refresh(base, { clientId, refreshToken: tokens.refresh_token });
      revocations.close();

      expect(replay.status).toBe(400);
      expect(replay.body.error).toBe("invalid_grant");
      const ttl = await withRedis((redis) => redis.ttl(revokedSidKey(sid)));
      expect(ttl).toBeGreaterThan(890);
      expect(ttl).toBeLessThanOrEqual(900);
      expect(revocations.received).toEqual([{ userId, sids: [sid] }]);
      expect(await webSessionOf(base, cookie)).toBeNull();
      expect(await auditEntriesOf(userId)).toEqual([
        {
          action: "identity.session.revoked",
          actorId: userId,
          reason: "refresh_token_reuse",
          userAgent: USER_AGENT,
          stateAfter: { revokedSids: [sid] },
        },
      ]);
    });
  });

  it("révoque l'utilisateur sur tous ses clients OAuth, sans toucher aux autres utilisateurs", async () => {
    await withApi(async (base) => {
      const { clientId, cookie, tokens } = await signIn(base);
      const otherClientId = await seedPublicClient();
      const otherClient = await signInDevice(base, {
        cookie,
        clientId: otherClientId,
        resource: API_RESOURCE,
      });
      const otherUser = await signIn(base);
      await refresh(base, { clientId, refreshToken: tokens.refresh_token });
      await expireReplayWindow(tokens.refresh_token);
      await refresh(base, { clientId, refreshToken: tokens.refresh_token });

      const otherClientRefresh = await refresh(base, {
        clientId: otherClientId,
        refreshToken: otherClient.refresh_token,
      });
      const otherUserRefresh = await refresh(base, {
        clientId: otherUser.clientId,
        refreshToken: otherUser.tokens.refresh_token,
      });
      expect(otherClientRefresh.body.error).toBe("invalid_grant");
      expect(otherUserRefresh.status).toBe(200);
      expect(await webSessionOf(base, otherUser.cookie)).not.toBeNull();
    });
  });

  it("traite en réutilisation un jeton consommé rejoué au-delà de 180 jours", async () => {
    await withApi(async (base) => {
      const { clientId, tokens } = await signIn(base);
      const { userId } = identityOf(tokens.access_token);
      await refresh(base, { clientId, refreshToken: tokens.refresh_token });
      await expireReplayWindow(tokens.refresh_token);
      await ageAuthentication(tokens.refresh_token, 181);
      const replay = await refresh(base, { clientId, refreshToken: tokens.refresh_token });

      expect(replay.body.error).toBe("invalid_grant");
      expect(await auditEntriesOf(userId)).toHaveLength(1);
    });
  });

  it("révoque en base malgré un Redis injoignable, journalise la panne et répond une erreur sous 4 s", async () => {
    const logs: string[] = [];
    await withApi(
      async (base) => {
        const { clientId, cookie, tokens } = await signIn(base);
        const { userId } = identityOf(tokens.access_token);
        await refresh(base, { clientId, refreshToken: tokens.refresh_token });
        await expireReplayWindow(tokens.refresh_token);
        const startedAt = performance.now();
        const replay = await refresh(base, { clientId, refreshToken: tokens.refresh_token });

        expect(replay.status).toBe(500);
        expect(performance.now() - startedAt).toBeLessThan(4000);
        expect(await webSessionOf(base, cookie)).toBeNull();
        expect(await auditEntriesOf(userId)).toHaveLength(1);
      },
      { env: { REDIS_URL: "redis://127.0.0.1:1" }, logSink: (line) => logs.push(line) },
    );

    expect(logs.map((line) => JSON.parse(line))).toContainEqual(
      expect.objectContaining({ level: "error", msg: "redis" }),
    );
  });

  it("ne réagit pas à un rejeu dans la fenêtre de 30 s", async () => {
    await withApi(async (base) => {
      const { clientId, cookie, tokens } = await signIn(base);
      const { userId, sid } = identityOf(tokens.access_token);
      await refresh(base, { clientId, refreshToken: tokens.refresh_token });
      await refresh(base, { clientId, refreshToken: tokens.refresh_token });

      expect(await withRedis((redis) => redis.exists(revokedSidKey(sid)))).toBe(0);
      expect(await webSessionOf(base, cookie)).not.toBeNull();
      expect(await auditEntriesOf(userId)).toEqual([]);
    });
  });

  it("identifie comptes et sessions par des UUID", async () => {
    await withApi(async (base) => {
      const { tokens } = await signIn(base);
      const { userId, sid } = identityOf(tokens.access_token);

      expect(userId).toMatch(UUID);
      expect(sid).toMatch(UUID);
    });
  });

  it("rend le compte du jeton sur GET /v1/me", async () => {
    await withApi(async (base) => {
      const { tokens } = await signIn(base);
      const { userId } = identityOf(tokens.access_token);

      expect(await me(base, tokens.access_token)).toEqual({
        status: 200,
        body: {
          id: userId,
          name: "Viewer de test",
          email: expect.stringMatching(/^oauth-.+@twitch\.local$/),
        },
      });
    });
  });

  it("refuse GET /v1/me sans jeton, ou avec un jeton opaque qui n'est pas pour /v1", async () => {
    await withApi(async (base) => {
      const { tokens } = await signIn(base, WITHOUT_RESOURCE);

      expect(await me(base)).toMatchObject({ status: 401 });
      expect(await me(base, tokens.access_token)).toMatchObject({ status: 401 });
    });
  });

  it("refuse GET /v1/me avec le jeton d'une session révoquée sur réutilisation", async () => {
    await withApi(async (base) => {
      const { clientId, tokens } = await signIn(base);
      await refresh(base, { clientId, refreshToken: tokens.refresh_token });
      await expireReplayWindow(tokens.refresh_token);
      await refresh(base, { clientId, refreshToken: tokens.refresh_token });

      expect(await me(base, tokens.access_token)).toMatchObject({ status: 401 });
    });
  });

  it("n'expose pas l'endpoint /token du plugin jwt", async () => {
    await withApi(async (base) => {
      const { cookie } = await signIn(base);

      expect((await fetch(`${base}/auth/token`, { headers: { cookie } })).status).toBe(404);
    });
  });
});
