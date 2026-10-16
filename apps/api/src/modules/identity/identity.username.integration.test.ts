import { randomUUID } from "node:crypto";

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

const withApi = async (run: (base: string) => Promise<void>) => {
  const { app } = await createApp({ env: process.env, logSink: () => {} });
  await app.listen(0, "127.0.0.1");
  try {
    await run(await app.getUrl());
  } finally {
    await app.close();
  }
};

const postJson = (url: string, body: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", origin: urlOf("BETTER_AUTH_URL") },
    body: JSON.stringify(body),
  });

const PASSWORD = "un-mot-de-passe-solide-42";

const uniqueUsername = () => `v_${randomUUID().replaceAll("-", "").slice(0, 10)}`;

const signUp = (base: string, username: string, email = `${randomUUID()}@twitch.local`) =>
  postJson(`${base}/auth/sign-up/email`, { name: username, email, password: PASSWORD, username });

const accountsNamed = async (username: string) => {
  const client = new Client({ connectionString: urlOf("DATABASE_URL_MIGRATOR") });
  await client.connect();
  try {
    const { rows } = await client.query<{ count: string }>(
      `SELECT count(*) FROM "identity"."IdentityUser" WHERE lower("username") = lower($1)`,
      [username],
    );
    return Number(rows[0]?.count);
  } finally {
    await client.end();
  }
};

describe("identity : nom d'utilisateur (ADR 0039, §2)", () => {
  it("inscrit un compte avec un nom d'utilisateur et le connecte par ce nom, quelle que soit la casse", async () => {
    await withApi(async (base) => {
      const username = uniqueUsername();

      expect((await signUp(base, username)).status).toBe(200);

      const signIn = await postJson(`${base}/auth/sign-in/username`, {
        username: username.toUpperCase(),
        password: PASSWORD,
      });
      expect(signIn.status).toBe(200);
      expect(signIn.headers.getSetCookie().join(";")).toMatch(/session_token=/);
    });
  });

  it("connecte toujours le même compte par e-mail", async () => {
    await withApi(async (base) => {
      const email = `${randomUUID()}@twitch.local`;
      await signUp(base, uniqueUsername(), email);

      expect(
        (await postJson(`${base}/auth/sign-in/email`, { email, password: PASSWORD })).status,
      ).toBe(200);
    });
  });

  it.each([
    ["trop court", "abc"],
    ["trop long", "a".repeat(26)],
    ["à caractère interdit", "bad-name"],
    ["avec un espace", "bad name"],
    ["réservé", "admin"],
    ["réservé, en majuscules", "Settings"],
    ["réservé, à souligné", "well_known"],
  ])("refuse un nom %s, sans créer de compte", async (_case, username) => {
    await withApi(async (base) => {
      expect((await signUp(base, username)).status).toBe(400);
    });
    expect(await accountsNamed(username)).toBe(0);
  });

  it.each([
    ["de 4 caractères", "abcd"],
    ["de 25 caractères", "a".repeat(25)],
  ])("accepte un nom %s", async (_case, base4) => {
    const username = `${base4.slice(0, base4.length - 4)}${randomUUID().replaceAll("-", "").slice(0, 4)}`;
    await withApi(async (base) => {
      expect((await signUp(base, username)).status).toBe(200);
    });
  });

  it("refuse un nom déjà pris, à la casse près", async () => {
    await withApi(async (base) => {
      const username = uniqueUsername();
      await signUp(base, username);

      const second = await signUp(base, username.toUpperCase());
      expect(second.ok).toBe(false);
      expect(await accountsNamed(username)).toBe(1);
    });
  });
});
