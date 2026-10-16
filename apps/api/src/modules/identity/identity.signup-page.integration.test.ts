import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { decodeJwt } from "jose";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { createApp } from "../../create-app.ts";
import { SIGNUP_CODE_MESSAGES } from "./infrastructure/pages/signup-code-page.ts";
import { SIGNUP_ERRORS } from "./infrastructure/pages/signup-page.ts";

const urlOf = (variable: string): string => {
  const url = process.env[variable];
  if (url === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return url;
};

const ORIGIN = new URL(urlOf("BETTER_AUTH_URL")).origin;
const API_RESOURCE = new URL("/v1", urlOf("BETTER_AUTH_URL")).href;
const REDIRECT_URI = "twitch-ios-signup://oauth/callback";

const PASSWORD = "un-mot-de-passe-solide-42";
const MAILPIT = `http://127.0.0.1:${process.env.MAILPIT_UI_PORT ?? "8025"}`;

const sleep = (milliseconds: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

type MailpitMessage = { readonly Text: string };

const mailsTo = async (email: string, count: number): Promise<readonly MailpitMessage[]> => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const search = (await (
      await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)
    ).json()) as { messages: { ID: string }[] };
    if (search.messages.length >= count) {
      return Promise.all(
        search.messages.map(
          async ({ ID }) =>
            (await (await fetch(`${MAILPIT}/api/v1/message/${ID}`)).json()) as MailpitMessage,
        ),
      );
    }
    await sleep(100);
  }
  throw new Error(`moins de ${count} e-mail(s) reçu(s) par ${email}`);
};

const codeIn = (message: MailpitMessage) => /\b(\d{6})\b/.exec(message.Text)?.[1] ?? "";

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
  const clientId = `ios-signup-${randomUUID()}`;
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

const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};

const cookiesOf = (response: Response): string =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");

const fieldIn = (body: string, name: string): string =>
  new RegExp(`name="${name}"\\s+value="([^"]*)"`).exec(body)?.[1]?.replaceAll("&amp;", "&") ?? "";

const openSignupPage = async (base: string, clientId: string, challenge: string) => {
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
      prompt: "create",
    })}`,
    { redirect: "manual", headers: { accept: "text/html", "sec-fetch-mode": "navigate" } },
  );
  const location =
    authorize.headers.get("location") ?? ((await authorize.json()) as { url: string }).url;
  const signup = new URL(location, base);
  const page = await fetch(signup, { headers: { accept: "text/html" } });
  const body = await page.text();
  return {
    signup,
    page,
    body,
    state,
    cookie: cookiesOf(page),
    csrf: fieldIn(body, "csrf"),
    oauthQuery: fieldIn(body, "oauth_query"),
  };
};

const newAccount = () => {
  const username = `n_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  return {
    username,
    email: `${username}@twitch.local`,
    password: PASSWORD,
    birth_month: "3",
    birth_day: "7",
    birth_year: "2000",
  };
};

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

const userRow = (email: string) =>
  asMigrator(async (client) => {
    const { rows } = await client.query<{ birthDate: string | null; emailVerified: boolean }>(
      `SELECT to_char("birthDate", 'YYYY-MM-DD') AS "birthDate", "emailVerified" FROM "identity"."IdentityUser" WHERE "email" = $1`,
      [email],
    );
    return rows[0];
  });

const withCookies = (cookie: string, response: Response): string =>
  [
    ...new Map(
      [...cookie.split("; "), ...cookiesOf(response).split("; ")]
        .filter((part) => part !== "")
        .map((part) => [part.split("=")[0], part] as const),
    ).values(),
  ].join("; ");

const signedUp = async (base: string, clientId: string, challenge: string) => {
  const opened = await openSignupPage(base, clientId, challenge);
  const account = newAccount();
  const response = await post(
    base,
    "/signup",
    { ...account, csrf: opened.csrf, oauth_query: opened.oauthQuery },
    { cookie: opened.cookie },
  );
  const body = await response.text();
  const [mail] = await mailsTo(account.email, 1);
  return {
    account,
    state: opened.state,
    oauthQuery: opened.oauthQuery,
    csrf: fieldIn(body, "csrf"),
    cookie: withCookies(opened.cookie, response),
    code: codeIn(mail ?? { Text: "" }),
  };
};

const optionsOf = (body: string, name: string): readonly string[] =>
  [
    ...(new RegExp(`name="${name}"[^>]*>([\\s\\S]*?)</select>`).exec(body)?.[1] ?? "").matchAll(
      /<option[^>]*>[^<]*<\/option>/g,
    ),
  ].map(([option]) => option);

describe("inscription servie par l'API (ADR 0039, §3)", () => {
  it("affiche l'inscription quand l'autorisation arrive avec prompt=create, avec la requête signée et un jeton CSRF", async () => {
    await withApi(async (base) => {
      const clientId = await seedClient();
      const { signup, page, body, csrf, oauthQuery } = await openSignupPage(
        base,
        clientId,
        pkce().challenge,
      );

      expect(signup.pathname).toBe("/signup");
      expect(page.status).toBe(200);
      expect(page.headers.get("content-type")).toMatch(/^text\/html/);
      expect(page.headers.get("cache-control")).toBe("no-store");
      expect(body).toContain("<title>Sign Up</title>");
      expect(body).toContain("Join Twitch today");
      expect(body).toContain('name="username"');
      expect(body).toContain('type="password"');
      expect(body).toContain('name="email"');
      expect(body).toContain('name="birth_month"');
      expect(body).toContain('name="birth_day"');
      expect(body).toContain('name="birth_year"');
      expect(fieldIn(body, "username")).toBe("");
      expect(fieldIn(body, "email")).toBe("");
      expect(oauthQuery).toBe(signup.search.slice(1));
      expect(csrf).toMatch(/^[\w-]{43}$/);
      expect(page.headers.getSetCookie().join(";")).toMatch(
        /twitch_csrf=[\w-]{43}; Path=\/signup; .*HttpOnly.*SameSite=Strict/i,
      );
    });
  });

  it("crée le compte avec sa date de naissance, envoie le code par e-mail et demande de le saisir, sans renvoyer vers l'app", async () => {
    await withApi(async (base) => {
      const clientId = await seedClient();
      const { cookie, csrf, oauthQuery } = await openSignupPage(base, clientId, pkce().challenge);
      const account = newAccount();

      const response = await post(
        base,
        "/signup",
        { ...account, csrf, oauth_query: oauthQuery },
        { cookie },
      );
      const body = await response.text();
      const [mail] = await mailsTo(account.email, 1);

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
      expect(body).toContain("<title>Verify your email</title>");
      expect(body).toContain(account.email);
      expect(body).toContain('autocomplete="one-time-code"');
      expect(fieldIn(body, "oauth_query")).toBe(oauthQuery);
      expect(response.headers.getSetCookie().join(";")).toMatch(/session_token=/);
      expect(codeIn(mail ?? { Text: "" })).toMatch(/^\d{6}$/);
      expect(await userRow(account.email)).toEqual({
        birthDate: "2000-03-07",
        emailVerified: false,
      });
    });
  });

  it.each([
    ["un nom d'utilisateur invalide", { username: "ab" }, SIGNUP_ERRORS.usernameInvalid],
    ["un mot de passe trop court", { password: "court" }, SIGNUP_ERRORS.password],
    [
      "un enfant de moins de 13 ans",
      { birth_year: String(new Date().getUTCFullYear() - 5) },
      SIGNUP_ERRORS.tooYoung,
    ],
    ["une date qui n'existe pas", { birth_month: "2", birth_day: "31" }, SIGNUP_ERRORS.birthDate],
  ])(
    "refuse %s, garde la saisie sans le mot de passe et ne crée aucun compte",
    async (_case, change, message) => {
      await withApi(async (base) => {
        const clientId = await seedClient();
        const { cookie, csrf, oauthQuery } = await openSignupPage(base, clientId, pkce().challenge);
        const account = { ...newAccount(), ...change };

        const response = await post(
          base,
          "/signup",
          { ...account, csrf, oauth_query: oauthQuery },
          { cookie },
        );
        const body = await response.text();

        expect(response.status).toBe(400);
        expect(body).toContain(message);
        expect(body).toContain("Join Twitch today");
        expect(fieldIn(body, "email")).toBe(account.email);
        expect(fieldIn(body, "oauth_query")).toBe(oauthQuery);
        expect(body).not.toContain(account.password);
        expect(response.headers.getSetCookie().join(";")).not.toMatch(/session_token=/);
        expect(await userRow(account.email)).toBeUndefined();
      });
    },
  );

  it.each([
    ["un nom d'utilisateur déjà pris", "username", SIGNUP_ERRORS.usernameTaken],
    ["un e-mail déjà inscrit", "email", SIGNUP_ERRORS.emailTaken],
  ] as const)("refuse %s", async (_case, reused, message) => {
    await withApi(async (base) => {
      const clientId = await seedClient();
      const first = newAccount();
      const opened = await openSignupPage(base, clientId, pkce().challenge);
      await post(
        base,
        "/signup",
        { ...first, csrf: opened.csrf, oauth_query: opened.oauthQuery },
        { cookie: opened.cookie },
      );
      const { cookie, csrf, oauthQuery } = await openSignupPage(base, clientId, pkce().challenge);

      const response = await post(
        base,
        "/signup",
        { ...newAccount(), [reused]: first[reused], csrf, oauth_query: oauthQuery },
        { cookie },
      );

      expect(response.status).toBe(400);
      expect(await response.text()).toContain(message);
    });
  });

  it("garde le mois, le jour et l'année choisis après un refus", async () => {
    await withApi(async (base) => {
      const clientId = await seedClient();
      const { cookie, csrf, oauthQuery } = await openSignupPage(base, clientId, pkce().challenge);

      const response = await post(
        base,
        "/signup",
        { ...newAccount(), username: "ab", csrf, oauth_query: oauthQuery },
        { cookie },
      );
      const body = await response.text();

      expect(body).toContain('<option value="3" selected>March</option>');
      expect(body).toContain('<option value="7" selected>7</option>');
      expect(body).toContain('<option value="2000" selected>2000</option>');
    });
  });

  it("vérifie l'adresse avec le code reçu et affiche « You're All Set! » avec l'illustration", async () => {
    await withApi(async (base) => {
      const clientId = await seedClient();
      const { account, cookie, csrf, oauthQuery, code } = await signedUp(
        base,
        clientId,
        pkce().challenge,
      );

      const response = await post(
        base,
        "/signup/code",
        { email: account.email, code, csrf, oauth_query: oauthQuery },
        { cookie },
      );
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
      expect(body).toContain("<title>Account Verification</title>");
      expect(body).toContain("You're All Set!");
      expect(body).toContain('src="/signup/you-are-all-set.png"');
      expect(body).toContain('action="/signup/continue"');
      expect(fieldIn(body, "oauth_query")).toBe(oauthQuery);
      expect((await userRow(account.email))?.emailVerified).toBe(true);
    });
  });

  it("refuse un code faux et redemande le code, sans vérifier l'adresse", async () => {
    await withApi(async (base) => {
      const clientId = await seedClient();
      const { account, cookie, csrf, oauthQuery, code } = await signedUp(
        base,
        clientId,
        pkce().challenge,
      );
      const wrong = code === "000000" ? "111111" : "000000";

      const response = await post(
        base,
        "/signup/code",
        { email: account.email, code: wrong, csrf, oauth_query: oauthQuery },
        { cookie },
      );
      const body = await response.text();

      expect(response.status).toBe(401);
      expect(body).toContain(SIGNUP_CODE_MESSAGES.code);
      expect(body).toContain("Verify your email");
      expect(fieldIn(body, "email")).toBe(account.email);
      expect((await userRow(account.email))?.emailVerified).toBe(false);
    });
  });

  it("Done renvoie vers l'app avec un code échangeable contre un token /v1", async () => {
    await withApi(async (base) => {
      const clientId = await seedClient();
      const { verifier, challenge } = pkce();
      const { account, cookie, csrf, oauthQuery, code, state } = await signedUp(
        base,
        clientId,
        challenge,
      );
      const verified = await post(
        base,
        "/signup/code",
        { email: account.email, code, csrf, oauth_query: oauthQuery },
        { cookie },
      );
      const allSet = await verified.text();

      const response = await post(
        base,
        "/signup/continue",
        { csrf: fieldIn(allSet, "csrf"), oauth_query: fieldIn(allSet, "oauth_query") },
        { cookie: withCookies(cookie, verified) },
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
  });

  it("ne renvoie pas vers l'app tant que l'adresse n'est pas vérifiée", async () => {
    await withApi(async (base) => {
      const clientId = await seedClient();
      const { account, cookie, csrf, oauthQuery } = await signedUp(
        base,
        clientId,
        pkce().challenge,
      );

      const response = await post(
        base,
        "/signup/continue",
        { csrf, oauth_query: oauthQuery },
        { cookie },
      );
      const body = await response.text();

      expect(response.status).toBe(403);
      expect(response.headers.get("location")).toBeNull();
      expect(body).toContain("Verify your email");
      expect(fieldIn(body, "email")).toBe(account.email);
    });
  });

  it("ne renvoie pas vers l'app sans session", async () => {
    await withApi(async (base) => {
      const clientId = await seedClient();
      const { cookie, csrf, oauthQuery } = await openSignupPage(base, clientId, pkce().challenge);

      const response = await post(
        base,
        "/signup/continue",
        { csrf, oauth_query: oauthQuery },
        { cookie },
      );

      expect(response.status).toBe(400);
      expect(response.headers.get("location")).toBeNull();
      expect(await response.text()).toContain("Join Twitch today");
    });
  });

  it("renvoie un nouveau code et le redemande", async () => {
    await withApi(async (base) => {
      const clientId = await seedClient();
      const { account, cookie, csrf, oauthQuery } = await signedUp(
        base,
        clientId,
        pkce().challenge,
      );

      const response = await post(
        base,
        "/signup/resend",
        { email: account.email, csrf, oauth_query: oauthQuery },
        { cookie },
      );
      const body = await response.text();
      const mails = await mailsTo(account.email, 2);

      expect(response.status).toBe(200);
      expect(body).toContain("Verify your email");
      expect(body).toContain(SIGNUP_CODE_MESSAGES.resent);
      expect(fieldIn(body, "email")).toBe(account.email);
      expect(fieldIn(body, "oauth_query")).toBe(oauthQuery);
      expect(body.match(new RegExp(`value="${fieldIn(body, "csrf")}"`, "g"))).toHaveLength(2);
      expect(mails).toHaveLength(2);
    });
  });

  it.each(["/signup", "/signup/code", "/signup/resend", "/signup/continue"])(
    "refuse sur %s un formulaire sans le jeton CSRF du cookie ou venu d'une autre origine",
    async (path) => {
      await withApi(async (base) => {
        const clientId = await seedClient();
        const { csrf, oauthQuery } = await openSignupPage(base, clientId, pkce().challenge);
        const account = newAccount();
        const form = { ...account, code: "123456", oauth_query: oauthQuery };

        const missing = await post(
          base,
          path,
          { ...form, csrf: "" },
          { cookie: `twitch_csrf=${csrf}` },
        );
        const different = await post(
          base,
          path,
          { ...form, csrf: `${csrf.slice(1)}x` },
          { cookie: `twitch_csrf=${csrf}` },
        );
        const foreign = await post(
          base,
          path,
          { ...form, csrf },
          { cookie: `twitch_csrf=${csrf}`, origin: "https://evil.example" },
        );

        expect([missing.status, different.status, foreign.status]).toEqual([403, 403, 403]);
        expect(await userRow(account.email)).toBeUndefined();
      });
    },
  );

  it("sert l'illustration de « You're All Set! » telle que versionnée dans docs/brand (ADR 0040)", async () => {
    await withApi(async (base) => {
      const response = await fetch(`${base}/signup/you-are-all-set.png`);
      const served = Buffer.from(await response.arrayBuffer());
      const versioned = await readFile(
        new URL("../../../../../docs/brand/you-are-all-set.png", import.meta.url),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
      expect(served.equals(versioned)).toBe(true);
    });
  });

  it("propose les mois de janvier à décembre, les jours de 1 à 31 et les 121 dernières années, sans rien présélectionner", async () => {
    await withApi(async (base) => {
      const clientId = await seedClient();
      const { body } = await openSignupPage(base, clientId, pkce().challenge);
      const year = new Date().getUTCFullYear();
      const months = optionsOf(body, "birth_month");
      const days = optionsOf(body, "birth_day");
      const years = optionsOf(body, "birth_year");

      expect(months).toHaveLength(13);
      expect(months.slice(0, 3)).toEqual([
        '<option value="" selected>Month</option>',
        '<option value="1">January</option>',
        '<option value="2">February</option>',
      ]);
      expect(months.at(-1)).toBe('<option value="12">December</option>');
      expect(days).toHaveLength(32);
      expect(days.slice(0, 3)).toEqual([
        '<option value="" selected>Day</option>',
        '<option value="1">1</option>',
        '<option value="2">2</option>',
      ]);
      expect(days.at(-1)).toBe('<option value="31">31</option>');
      expect(years).toHaveLength(122);
      expect(years.slice(0, 3)).toEqual([
        '<option value="" selected>Year</option>',
        `<option value="${year}">${year}</option>`,
        `<option value="${year - 1}">${year - 1}</option>`,
      ]);
      expect(years.at(-1)).toBe(`<option value="${year - 120}">${year - 120}</option>`);
    });
  });

  it("ignore les espaces autour du nom d'utilisateur et de l'e-mail", async () => {
    await withApi(async (base) => {
      const clientId = await seedClient();
      const { cookie, csrf, oauthQuery } = await openSignupPage(base, clientId, pkce().challenge);
      const account = newAccount();

      const response = await post(
        base,
        "/signup",
        {
          ...account,
          username: `  ${account.username} `,
          email: ` ${account.email}  `,
          csrf,
          oauth_query: oauthQuery,
        },
        { cookie },
      );

      expect(response.status).toBe(200);
      expect(await userRow(account.email)).toBeDefined();
    });
  });

  it("Done avec une requête OAuth illisible ne renvoie pas vers l'app et invite à recommencer", async () => {
    await withApi(async (base) => {
      const clientId = await seedClient();
      const { account, cookie, csrf, oauthQuery, code } = await signedUp(
        base,
        clientId,
        pkce().challenge,
      );
      const verified = await post(
        base,
        "/signup/code",
        { email: account.email, code, csrf, oauth_query: oauthQuery },
        { cookie },
      );
      const allSet = await verified.text();

      const response = await post(
        base,
        "/signup/continue",
        { csrf: fieldIn(allSet, "csrf"), oauth_query: "" },
        { cookie: withCookies(cookie, verified) },
      );
      const body = await response.text();

      expect(response.status).toBe(400);
      expect(response.headers.get("location")).toBeNull();
      expect(body).toContain(SIGNUP_ERRORS.expired);
      expect(body).toContain("Join Twitch today");
    });
  });

  it("ouverte sans requête OAuth, la page ne porte aucune requête", async () => {
    await withApi(async (base) => {
      const body = await (await fetch(`${base}/signup`)).text();

      expect(fieldIn(body, "oauth_query")).toBe("");
    });
  });
});
