import { createHash, randomBytes, randomUUID } from "node:crypto";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { createApp } from "../../create-app.ts";
import { RESET_MESSAGES } from "./infrastructure/pages/reset-page.ts";

const urlOf = (variable: string): string => {
  const url = process.env[variable];
  if (url === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return url;
};

const ORIGIN = new URL(urlOf("BETTER_AUTH_URL")).origin;
const API_RESOURCE = new URL("/v1", urlOf("BETTER_AUTH_URL")).href;
const REDIRECT_URI = "twitch-ios-reset://oauth/callback";
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
  const clientId = `ios-reset-${randomUUID()}`;
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
    new RegExp(`name="${name}"\\s+value="([^"]*)"`).exec(body)?.[1]?.replaceAll("&amp;", "&") ?? "";
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

const MAILPIT = `http://127.0.0.1:${process.env.MAILPIT_UI_PORT ?? "8025"}`;
const RESET_SUBJECT = "Your Twitch password reset code";
const NEW_PASSWORD = "un-nouveau-mot-de-passe-43";

const sleep = (milliseconds: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

type MailpitMessage = { readonly Subject: string; readonly Text: string };

const mailsTo = async (email: string): Promise<readonly MailpitMessage[]> => {
  const search = (await (
    await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)
  ).json()) as { messages: { ID: string }[] };
  return Promise.all(
    search.messages.map(
      async ({ ID }) =>
        (await (await fetch(`${MAILPIT}/api/v1/message/${ID}`)).json()) as MailpitMessage,
    ),
  );
};

const resetCodeTo = async (email: string): Promise<string> => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const reset = (await mailsTo(email)).find(({ Subject }) => Subject === RESET_SUBJECT);
    if (reset !== undefined) {
      return /\b(\d{6})\b/.exec(reset.Text)?.[1] ?? "";
    }
    await sleep(100);
  }
  throw new Error(`aucun code de réinitialisation reçu par ${email}`);
};

const fieldIn = (body: string, name: string): string =>
  new RegExp(`name="${name}"\\s+value="([^"]*)"`).exec(body)?.[1]?.replaceAll("&amp;", "&") ?? "";

const post = (
  base: string,
  path: string,
  form: Record<string, string>,
  { cookie, origin = ORIGIN }: { cookie: string; origin?: string },
) =>
  fetch(`${base}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", origin, cookie },
    body: new URLSearchParams(form),
  });

const openResetPage = async (base: string, clientId: string) => {
  const { body: loginBody } = await openLoginPage(base, clientId, pkce().challenge);
  const href = /href="(\/login\/reset[^"]*)"/.exec(loginBody)?.[1]?.replaceAll("&amp;", "&") ?? "";
  const page = await fetch(new URL(href, base), { headers: { accept: "text/html" } });
  const body = await page.text();
  return {
    loginBody,
    href,
    page,
    body,
    cookie: page.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; "),
    csrf: fieldIn(body, "csrf"),
    oauthQuery: fieldIn(body, "oauth_query"),
  };
};

const requestCode = async (base: string, clientId: string, email: string) => {
  const opened = await openResetPage(base, clientId);
  const response = await post(
    base,
    "/login/reset",
    { email, csrf: opened.csrf, oauth_query: opened.oauthQuery },
    { cookie: opened.cookie },
  );
  const body = await response.text();
  return {
    response,
    body,
    cookie: response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; "),
    oauthQuery: opened.oauthQuery,
    csrf: fieldIn(body, "csrf"),
  };
};

describe("réinitialisation du mot de passe servie par l'API (plan auth, A5)", () => {
  it("la connexion propose « Trouble logging in? », qui ouvre la demande avec la même requête OAuth", async () => {
    await withApi(async (base) => {
      const clientId = await seedClient();
      const { loginBody, href, page, body, csrf, oauthQuery } = await openResetPage(base, clientId);

      expect(new URL(href, base).pathname).toBe("/login/reset");
      expect(page.status).toBe(200);
      expect(page.headers.get("cache-control")).toBe("no-store");
      expect(body).toContain("<title>Reset your password</title>");
      expect(body).toContain('name="email"');
      expect(oauthQuery).toBe(new URL(href, base).search.slice(1));
      expect(oauthQuery).not.toBe("");
      expect(csrf).toMatch(/^[\w-]{43}$/);
      expect(fieldIn(loginBody, "identifier")).toBe("");
    });
  });

  it("ouverte sans requête OAuth, la demande ne porte aucune requête", async () => {
    await withApi(async (base) => {
      const body = await (await fetch(`${base}/login/reset`)).text();

      expect(fieldIn(body, "oauth_query")).toBe("");
    });
  });

  it("ignore les espaces autour de l'adresse et garde la requête OAuth jusqu'au code", async () => {
    await withApi(async (base) => {
      const clientId = await seedClient();
      const { email } = await signUp(base);

      const { body, oauthQuery } = await requestCode(base, clientId, `  ${email} `);

      expect(body).toContain("<title>Reset your password</title>");
      expect(fieldIn(body, "oauth_query")).toBe(oauthQuery);
      expect(fieldIn(body, "email")).toBe(email);
      expect(await resetCodeTo(email)).toMatch(/^\d{6}$/);
    });
  });

  it("répond la même page, au même statut, pour une adresse connue et une adresse inconnue", async () => {
    await withApi(async (base) => {
      const clientId = await seedClient();
      const { email } = await signUp(base);
      const unknown = `inconnu_${randomUUID().slice(0, 8)}@twitch.local`;

      const forKnown = await requestCode(base, clientId, email);
      const forUnknown = await requestCode(base, clientId, unknown);
      await resetCodeTo(email);

      expect(forKnown.response.status).toBe(200);
      expect(forUnknown.response.status).toBe(200);
      expect(forKnown.body).toContain("Enter your verification code");
      expect(
        forKnown.body
          .replaceAll(email, "")
          .replaceAll(forKnown.csrf, "")
          .replaceAll(forKnown.oauthQuery.replaceAll("&", "&amp;"), ""),
      ).toBe(
        forUnknown.body
          .replaceAll(unknown, "")
          .replaceAll(forUnknown.csrf, "")
          .replaceAll(forUnknown.oauthQuery.replaceAll("&", "&amp;"), ""),
      );
      expect(await mailsTo(unknown)).toEqual([]);
    });
  });

  it("change le mot de passe avec le code reçu, puis ramène à la connexion où le nouveau mot de passe renvoie vers l'app", async () => {
    await withApi(async (base) => {
      const clientId = await seedClient();
      const { email } = await signUp(base);
      const { cookie, csrf, oauthQuery } = await requestCode(base, clientId, email);

      const response = await post(
        base,
        "/login/reset/password",
        {
          email,
          code: await resetCodeTo(email),
          password: NEW_PASSWORD,
          csrf,
          oauth_query: oauthQuery,
        },
        { cookie },
      );
      const body = await response.text();
      const loginCookie = response.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .join("; ");
      const oldPassword = await submit(
        base,
        {
          identifier: email,
          password: PASSWORD,
          csrf: fieldIn(body, "csrf"),
          oauth_query: fieldIn(body, "oauth_query"),
        },
        { cookie: loginCookie },
      );
      const newPassword = await submit(
        base,
        {
          identifier: email,
          password: NEW_PASSWORD,
          csrf: fieldIn(body, "csrf"),
          oauth_query: fieldIn(body, "oauth_query"),
        },
        { cookie: loginCookie },
      );

      expect(response.status).toBe(200);
      expect(body).toContain("<title>Log In</title>");
      expect(body).toContain(`<p class="notice" role="status">${RESET_MESSAGES.done}</p>`);
      expect(body).not.toContain('role="alert"');
      expect(fieldIn(body, "identifier")).toBe(email);
      expect(fieldIn(body, "oauth_query")).toBe(oauthQuery);
      expect(oldPassword.status).toBe(401);
      expect(newPassword.status).toBe(302);
      expect(new URL(newPassword.headers.get("location") ?? "about:blank").protocol).toBe(
        "twitch-ios-reset:",
      );
    });
  });

  it.each([
    ["un code faux", { code: "wrong" }, 401, RESET_MESSAGES.code],
    ["un mot de passe trop court", { password: "court" }, 400, RESET_MESSAGES.password],
    ["un mot de passe trop long", { password: "x".repeat(129) }, 400, RESET_MESSAGES.password],
  ])(
    "refuse %s, redemande le code et garde l'ancien mot de passe",
    async (_case, change, status, message) => {
      await withApi(async (base) => {
        const clientId = await seedClient();
        const { email } = await signUp(base);
        const { cookie, csrf, oauthQuery } = await requestCode(base, clientId, email);
        const code = await resetCodeTo(email);
        const form = {
          email,
          code,
          password: NEW_PASSWORD,
          csrf,
          oauth_query: oauthQuery,
          ...change,
        };

        const response = await post(
          base,
          "/login/reset/password",
          {
            ...form,
            code: form.code === "wrong" ? (code === "000000" ? "111111" : "000000") : form.code,
          },
          { cookie },
        );
        const body = await response.text();
        const signIn = await fetch(`${base}/auth/sign-in/email`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: ORIGIN },
          body: JSON.stringify({ email, password: PASSWORD }),
        });

        expect(response.status).toBe(status);
        expect(body).toContain(message);
        expect(body).toContain("Enter your verification code");
        expect(fieldIn(body, "email")).toBe(email);
        expect(body).not.toContain(NEW_PASSWORD);
        expect(signIn.status).toBe(200);
      });
    },
  );

  it.each(["/login/reset", "/login/reset/password"])(
    "refuse sur %s un formulaire sans le jeton CSRF du cookie ou venu d'une autre origine",
    async (path) => {
      await withApi(async (base) => {
        const clientId = await seedClient();
        const { email } = await signUp(base);
        const { csrf, oauthQuery } = await openResetPage(base, clientId);
        const form = { email, code: "123456", password: NEW_PASSWORD, oauth_query: oauthQuery };

        const missing = await post(
          base,
          path,
          { ...form, csrf: "" },
          { cookie: `twitch_csrf=${csrf}` },
        );
        const foreign = await post(
          base,
          path,
          { ...form, csrf },
          { cookie: `twitch_csrf=${csrf}`, origin: "https://evil.example" },
        );

        expect([missing.status, foreign.status]).toEqual([403, 403]);
        expect((await mailsTo(email)).filter(({ Subject }) => Subject === RESET_SUBJECT)).toEqual(
          [],
        );
      });
    },
  );
});
