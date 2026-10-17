import { createHash, randomBytes, randomUUID } from "node:crypto";

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
const REDIRECT_URI = "twitch-ios-pages://oauth/callback";
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
  const clientId = `ios-pages-${randomUUID()}`;
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

describe("page de connexion servie par l'API (ADR 0039, §1)", () => {
  it("affiche la connexion quand l'autorisation arrive sans session, avec la requête signée et un jeton CSRF", async () => {
    await withApi(async (base) => {
      const clientId = await seedClient();
      const { login, page, body, csrf, oauthQuery } = await openLoginPage(
        base,
        clientId,
        pkce().challenge,
      );

      expect(login.pathname).toBe("/login");
      expect(page.status).toBe(200);
      expect(page.headers.get("content-type")).toMatch(/^text\/html/);
      expect(page.headers.get("cache-control")).toBe("no-store");
      expect(body).toContain("<title>Log In</title>");
      expect(body).toContain('name="identifier"');
      expect(body).toContain('type="password"');
      expect(oauthQuery).toBe(login.search.slice(1));
      expect(csrf).toMatch(/^[\w-]{43}$/);
      expect(page.headers.getSetCookie().join(";")).toMatch(
        /twitch_csrf=[\w-]{43}; .*HttpOnly.*SameSite=Strict/i,
      );
    });
  });

  it.each(["username", "email"] as const)(
    "connecte par %s et renvoie vers l'app avec un code échangeable contre un token /v1",
    async (kind) => {
      await withApi(async (base) => {
        const clientId = await seedClient();
        const account = await signUp(base);
        const { verifier, challenge } = pkce();
        const { cookie, csrf, oauthQuery, state } = await openLoginPage(base, clientId, challenge);

        const response = await submit(
          base,
          { identifier: account[kind], password: PASSWORD, csrf, oauth_query: oauthQuery },
          { cookie },
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
        expect(callback.searchParams.get("state")).toBe(state);
        expect(decodeJwt(access_token).aud).toContain(API_RESOURCE);
      });
    },
  );

  it("répond pareil à un mauvais mot de passe et à un compte inconnu, sans dire lequel des champs est faux", async () => {
    await withApi(async (base) => {
      const clientId = await seedClient();
      const account = await signUp(base);
      const attempt = async (identifier: string) => {
        const { cookie, csrf, oauthQuery } = await openLoginPage(base, clientId, pkce().challenge);
        const response = await submit(
          base,
          { identifier, password: "pas-le-bon-mot-de-passe", csrf, oauth_query: oauthQuery },
          { cookie },
        );
        return { status: response.status, body: await response.text() };
      };

      const wrongPassword = await attempt(account.username);
      const unknown = await attempt(`inconnu_${randomUUID().slice(0, 8)}`);

      expect(wrongPassword.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(wrongPassword.body).toContain(
        '<p class="error" role="alert">Incorrect username or password.</p>',
      );
      expect(unknown.body).toContain("Incorrect username or password.");
    });
  });

  it("ne prétend pas que le mot de passe est faux quand la page a été ouverte sans requête OAuth", async () => {
    await withApi(async (base) => {
      const clientId = await seedClient();
      const account = await signUp(base);
      const { cookie, csrf } = await openLoginPage(base, clientId, pkce().challenge);

      const response = await submit(
        base,
        { identifier: account.username, password: PASSWORD, csrf, oauth_query: "" },
        { cookie },
      );
      const body = await response.text();

      expect(response.status).toBe(400);
      expect(body).toContain("This sign-in link has expired. Go back to the app and try again.");
      expect(body).not.toContain("Incorrect username or password.");
    });
  });

  it("échappe l'identifiant renvoyé dans la page", async () => {
    await withApi(async (base) => {
      const clientId = await seedClient();
      const { cookie, csrf, oauthQuery } = await openLoginPage(base, clientId, pkce().challenge);
      const response = await submit(
        base,
        { identifier: '"><script>alert(1)</script>', password: "x", csrf, oauth_query: oauthQuery },
        { cookie },
      );
      const body = await response.text();

      expect(body).not.toContain("<script>alert(1)</script>");
      expect(body).toContain("&quot;&gt;&lt;script&gt;");
    });
  });

  it.each([
    ["sans jeton CSRF", (csrf: string) => ({ csrf: "", cookieCsrf: csrf, origin: ORIGIN })],
    [
      "avec un jeton CSRF différent du cookie",
      (csrf: string) => ({ csrf: `${csrf.slice(1)}x`, cookieCsrf: csrf, origin: ORIGIN }),
    ],
    ["sans cookie CSRF", (csrf: string) => ({ csrf, cookieCsrf: "", origin: ORIGIN })],
    [
      "avec un jeton et un cookie CSRF vides",
      (_csrf: string) => ({ csrf: "", cookieCsrf: "", origin: ORIGIN }),
    ],
    [
      "depuis une autre origine",
      (csrf: string) => ({ csrf, cookieCsrf: csrf, origin: "https://evil.example" }),
    ],
  ])("refuse un formulaire %s", async (_case, forge) => {
    await withApi(async (base) => {
      const clientId = await seedClient();
      const account = await signUp(base);
      const { csrf, oauthQuery } = await openLoginPage(base, clientId, pkce().challenge);
      const forged = forge(csrf);

      const response = await submit(
        base,
        {
          identifier: account.username,
          password: PASSWORD,
          csrf: forged.csrf,
          oauth_query: oauthQuery,
        },
        { cookie: `twitch_csrf=${forged.cookieCsrf}`, origin: forged.origin },
      );

      expect(response.status).toBe(403);
      expect(response.headers.getSetCookie().join(";")).not.toMatch(/session_token=/);
    });
  });

  it("refuse une requête OAuth modifiée", async () => {
    await withApi(async (base) => {
      const clientId = await seedClient();
      const account = await signUp(base);
      const { cookie, csrf, oauthQuery } = await openLoginPage(base, clientId, pkce().challenge);
      const tampered = oauthQuery.replace("twitch-ios-pages", "evil-app");

      const response = await submit(
        base,
        { identifier: account.username, password: PASSWORD, csrf, oauth_query: tampered },
        { cookie },
      );

      expect(response.status).toBe(400);
      expect(response.headers.get("location")).toBeNull();
    });
  });

  it("sert la feuille de style des pages, générée depuis les tokens", async () => {
    await withApi(async (base) => {
      const response = await fetch(`${base}/login/styles.css`);
      const css = await response.text();

      expect(response.headers.get("content-type")).toMatch(/^text\/css/);
      expect(css).toContain("--color-accent-default: #9147ff;");
      expect(css).toContain("background: var(--color-background-primary);");
    });
  });
});
