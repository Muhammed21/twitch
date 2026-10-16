import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";

import { decodeJwt } from "jose";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { createApp } from "../../create-app.ts";

const urlOf = (variable: string): string => {
  const url = process.env[variable];
  if (url === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return url;
};

const ORIGIN = new URL(urlOf("BETTER_AUTH_URL")).origin;
const API_RESOURCE = new URL("/v1", urlOf("BETTER_AUTH_URL")).href;
const REDIRECT_URI = "twitch-ios-2fa://oauth/callback";
const PASSWORD = "un-mot-de-passe-solide-42";

const asMigrator = async <T>(run: (client: Client) => Promise<T>): Promise<T> => {
  const client = new Client({ connectionString: urlOf("DATABASE_URL_MIGRATOR") });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
};

const seedClient = async (): Promise<string> => {
  const clientId = `ios-2fa-${randomUUID()}`;
  await asMigrator(async (client) => {
    await client.query(
      `INSERT INTO "identity"."IdentityOAuthResource" ("id", "identifier", "name")
       VALUES ($1, $2, $2) ON CONFLICT ("identifier") DO NOTHING`,
      [randomUUID(), API_RESOURCE],
    );
    await client.query(
      `INSERT INTO "identity"."IdentityOAuthClient"
         ("id", "clientId", "redirectUris", "tokenEndpointAuthMethod", "grantTypes", "responseTypes",
          "requirePKCE", "skipConsent", "scopes", "clientCredentialsScopes", "contacts",
          "postLogoutRedirectUris", "applicationType", "name")
       VALUES ($1, $2, $3, 'none', '["authorization_code","refresh_token"]', '["code"]',
               true, true, '["openid","profile","email","offline_access"]', '[]', '[]', '[]', 'native', 'Twitch iOS')`,
      [randomUUID(), clientId, [REDIRECT_URI]],
    );
    await client.query(
      `INSERT INTO "identity"."IdentityOAuthClientResource" ("id", "clientId", "resourceId") VALUES ($1, $2, $3)`,
      [randomUUID(), clientId, API_RESOURCE],
    );
  });
  return clientId;
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

const signUp = async (base: string) => {
  const username = `v_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const email = `${username}@twitch.local`;
  await fetch(`${base}/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({
      name: username,
      email,
      password: PASSWORD,
      username,
      birthDate: "2000-01-01",
    }),
  });
  return { username, email };
};

const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};

const openLoginPage = async (base: string, clientId: string, challenge: string) => {
  const state = randomUUID();
  const authorize = await fetch(
    `${base}/auth/oauth2/authorize?${new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      scope: "openid profile email offline_access",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      resource: API_RESOURCE,
    })}`,
    { redirect: "manual", headers: { accept: "text/html", "sec-fetch-mode": "navigate" } },
  );
  const location =
    authorize.headers.get("location") ?? ((await authorize.json()) as { url: string }).url;
  const login = new URL(location, base);
  const page = await fetch(login, { headers: { accept: "text/html" } });
  const body = await page.text();
  const cookie = page.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const field = (name: string) =>
    new RegExp(`name="${name}" value="([^"]*)"`).exec(body)?.[1]?.replaceAll("&amp;", "&") ?? "";
  return {
    login,
    page,
    body,
    cookie,
    state,
    csrf: field("csrf"),
    oauthQuery: field("oauth_query"),
  };
};

const submit = (
  base: string,
  form: Record<string, string>,
  { cookie, origin = ORIGIN }: { cookie: string; origin?: string },
) =>
  fetch(`${base}/login`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", origin, cookie },
    body: new URLSearchParams(form),
  });

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const base32Decode = (encoded: string) => {
  const bits = encoded
    .replace(/=+$/, "")
    .split("")
    .map((char) => BASE32.indexOf(char).toString(2).padStart(5, "0"))
    .join("");
  return Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => Number.parseInt(byte, 2)));
};

const totpOf = (secret: string, at = Date.now()) => {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const digest = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  return String((digest.readUInt32BE(offset) & 0x7f_ff_ff_ff) % 1_000_000).padStart(6, "0");
};

const cookiesOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");

const signUpWithTwoFactor = async (base: string) => {
  const account = await signUp(base);
  const signIn = await fetch(`${base}/auth/sign-in/username`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ username: account.username, password: PASSWORD }),
  });
  const cookie = cookiesOf(signIn);
  const enable = await fetch(`${base}/auth/two-factor/enable`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, cookie },
    body: JSON.stringify({ password: PASSWORD }),
  });
  const { totpURI } = (await enable.json()) as { totpURI: string };
  const secret = new URL(totpURI).searchParams.get("secret") ?? "";
  await fetch(`${base}/auth/two-factor/verify-totp`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, cookie },
    body: JSON.stringify({ code: totpOf(secret) }),
  });
  return { ...account, secret };
};

const hiddenField = (body: string, name: string) =>
  new RegExp(`name="${name}" value="([^"]*)"`).exec(body)?.[1]?.replaceAll("&amp;", "&") ?? "";

const passwordStep = async (
  base: string,
  clientId: string,
  challenge: string,
  username: string,
) => {
  const login = await openLoginPage(base, clientId, challenge);
  const response = await submit(
    base,
    { identifier: username, password: PASSWORD, csrf: login.csrf, oauth_query: login.oauthQuery },
    { cookie: login.cookie },
  );
  const body = await response.text();
  return {
    response,
    body,
    state: login.state,
    cookie: cookiesOf(response),
    csrf: hiddenField(body, "csrf"),
    oauthQuery: hiddenField(body, "oauth_query"),
  };
};

const submitCode = (
  base: string,
  form: Record<string, string>,
  { cookie, origin = ORIGIN }: { cookie: string; origin?: string },
) =>
  fetch(`${base}/login/two-factor`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", origin, cookie },
    body: new URLSearchParams(form),
  });

describe("étape 2FA de la connexion (ADR 0039, §5)", () => {
  it("affiche « Welcome back » après le mot de passe d'un compte TOTP, sans ouvrir de session", async () => {
    await withApi(async (base) => {
      const clientId = await seedClient();
      const account = await signUpWithTwoFactor(base);
      const step = await passwordStep(base, clientId, pkce().challenge, account.username);

      expect(step.response.status).toBe(200);
      expect(step.body).toContain(`Welcome back,<br />${account.username}!`);
      expect(step.body).toContain('name="code"');
      expect(step.body).toContain('autocomplete="one-time-code"');
      expect(step.oauthQuery).not.toBe("");
      expect(step.cookie).toMatch(/two_factor=/);
      expect(step.cookie).not.toMatch(/session_token=[^;]/);
    });
  });

  it("reprend l'autorisation avec le bon code, jusqu'à un token /v1", async () => {
    await withApi(async (base) => {
      const clientId = await seedClient();
      const account = await signUpWithTwoFactor(base);
      const { verifier, challenge } = pkce();
      const step = await passwordStep(base, clientId, challenge, account.username);

      const response = await submitCode(
        base,
        { code: totpOf(account.secret), csrf: step.csrf, oauth_query: step.oauthQuery },
        { cookie: step.cookie },
      );
      const callback = new URL(response.headers.get("location") ?? "about:blank");
      const exchange = await fetch(`${base}/auth/oauth2/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: callback.searchParams.get("code") ?? "",
          redirect_uri: REDIRECT_URI,
          client_id: clientId,
          code_verifier: verifier,
          resource: API_RESOURCE,
        }),
      });
      const { access_token } = (await exchange.json()) as { access_token: string };

      expect(response.status).toBe(302);
      expect(`${callback.protocol}//${callback.host}${callback.pathname}`).toBe(REDIRECT_URI);
      expect(callback.searchParams.get("state")).toBe(step.state);
      expect(decodeJwt(access_token).twitch_amr).toEqual(["pwd", "otp", "mfa"]);
    });
  });

  it("refuse un code faux et reste sur l'étape 2FA", async () => {
    await withApi(async (base) => {
      const clientId = await seedClient();
      const account = await signUpWithTwoFactor(base);
      const step = await passwordStep(base, clientId, pkce().challenge, account.username);
      const wrong = totpOf(account.secret) === "000000" ? "111111" : "000000";

      const response = await submitCode(
        base,
        { code: wrong, csrf: step.csrf, oauth_query: step.oauthQuery },
        { cookie: step.cookie },
      );
      const body = await response.text();

      expect(response.status).toBe(401);
      expect(response.headers.get("location")).toBeNull();
      expect(body).toContain("Incorrect code. Try again.");
      expect(body).toContain('name="code"');
    });
  });

  it("refuse le code sans le cookie 2FA de l'étape mot de passe", async () => {
    await withApi(async (base) => {
      const clientId = await seedClient();
      const account = await signUpWithTwoFactor(base);
      const step = await passwordStep(base, clientId, pkce().challenge, account.username);
      const csrfOnly = step.cookie
        .split("; ")
        .filter((cookie) => cookie.startsWith("twitch_csrf="))
        .join("; ");

      const response = await submitCode(
        base,
        { code: totpOf(account.secret), csrf: step.csrf, oauth_query: step.oauthQuery },
        { cookie: csrfOnly },
      );

      expect(response.status).toBe(400);
      expect(response.headers.get("location")).toBeNull();
    });
  });

  it.each([
    [
      "un cookie 2FA expiré ou invalide",
      (step: { cookie: string; oauthQuery: string }) => ({
        cookie: step.cookie.replace(/(better-auth\.two_factor=)[^;]*/, "$1invalide"),
        oauthQuery: step.oauthQuery,
      }),
    ],
    [
      "une requête OAuth expirée ou modifiée",
      (step: { cookie: string; oauthQuery: string }) => ({
        cookie: step.cookie,
        oauthQuery: step.oauthQuery.replace("twitch-ios-2fa", "evil-app"),
      }),
    ],
  ])("renvoie vers la connexion, sans parler de code faux, après %s", async (_case, alter) => {
    await withApi(async (base) => {
      const clientId = await seedClient();
      const account = await signUpWithTwoFactor(base);
      const step = await passwordStep(base, clientId, pkce().challenge, account.username);
      const altered = alter(step);

      const response = await submitCode(
        base,
        { code: totpOf(account.secret), csrf: step.csrf, oauth_query: altered.oauthQuery },
        { cookie: altered.cookie },
      );
      const body = await response.text();

      expect(response.status).toBe(400);
      expect(body).toContain("This sign-in link has expired. Go back to the app and try again.");
      expect(body).not.toContain("Incorrect code.");
    });
  });

  it.each([
    ["sans jeton CSRF", { csrf: "", origin: ORIGIN }],
    ["depuis une autre origine", { csrf: undefined, origin: "https://evil.example" }],
  ])("refuse un code envoyé %s", async (_case, forged) => {
    await withApi(async (base) => {
      const clientId = await seedClient();
      const account = await signUpWithTwoFactor(base);
      const step = await passwordStep(base, clientId, pkce().challenge, account.username);

      const response = await submitCode(
        base,
        {
          code: totpOf(account.secret),
          csrf: forged.csrf ?? step.csrf,
          oauth_query: step.oauthQuery,
        },
        { cookie: step.cookie, origin: forged.origin },
      );

      expect(response.status).toBe(403);
    });
  });
});
