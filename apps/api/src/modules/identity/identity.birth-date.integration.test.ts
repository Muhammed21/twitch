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

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

const yearsAgo = (years: number, extraDays = 0) => {
  const today = new Date();
  return isoDate(
    new Date(
      Date.UTC(today.getUTCFullYear() - years, today.getUTCMonth(), today.getUTCDate() + extraDays),
    ),
  );
};

const signUp = (base: string, email: string, birthDate?: string) =>
  fetch(`${base}/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: urlOf("BETTER_AUTH_URL") },
    body: JSON.stringify({
      name: "Viewer",
      email,
      password: "un-mot-de-passe-solide-42",
      ...(birthDate === undefined ? {} : { birthDate }),
    }),
  });

const storedBirthDate = async (email: string) => {
  const client = new Client({ connectionString: urlOf("DATABASE_URL_MIGRATOR") });
  await client.connect();
  try {
    const { rows } = await client.query<{ birthDate: string | null }>(
      `SELECT to_char("birthDate", 'YYYY-MM-DD') AS "birthDate" FROM "identity"."IdentityUser" WHERE "email" = $1`,
      [email],
    );
    return rows.map((row) => row.birthDate);
  } finally {
    await client.end();
  }
};

describe("identity : date de naissance à l'inscription (ADR 0039, §3)", () => {
  it("inscrit un compte de 13 ans pile et stocke sa date de naissance", async () => {
    const email = `${randomUUID()}@twitch.local`;
    const birthDate = yearsAgo(13);

    await withApi(async (base) => {
      const response = await signUp(base, email, birthDate);

      expect(response.status).toBe(200);
      expect(await response.text()).not.toContain("un-mot-de-passe-solide-42");
    });
    expect(await storedBirthDate(email)).toEqual([birthDate]);
  });

  it.each([
    ["de 12 ans et 364 jours", yearsAgo(13, 1), "BIRTH_DATE_TOO_YOUNG"],
    ["absente", undefined, "BIRTH_DATE_MISSING"],
    ["mal formée", "2000-02-30", "BIRTH_DATE_MALFORMED"],
    ["dans le futur", yearsAgo(0, 1), "BIRTH_DATE_FUTURE"],
  ])("refuse une date %s, sans créer de compte", async (_case, birthDate, code) => {
    const email = `${randomUUID()}@twitch.local`;

    await withApi(async (base) => {
      const response = await signUp(base, email, birthDate);

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code });
    });
    expect(await storedBirthDate(email)).toEqual([]);
  });

  it.each([
    ["plus jeune", yearsAgo(5)],
    ["dans le futur", yearsAgo(0, 1)],
    ["plus âgée", "1990-01-01"],
  ])("refuse de changer la date de naissance après l'inscription, %s", async (_case, birthDate) => {
    const email = `${randomUUID()}@twitch.local`;

    await withApi(async (base) => {
      const signedUp = await signUp(base, email, "2000-01-01");
      const cookie = signedUp.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .join("; ");
      const update = await fetch(`${base}/auth/update-user`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: urlOf("BETTER_AUTH_URL"),
          cookie,
        },
        body: JSON.stringify({ birthDate }),
      });

      expect(update.status).toBe(400);
      expect(await update.json()).toMatchObject({ code: "BIRTH_DATE_IMMUTABLE" });
    });
    expect(await storedBirthDate(email)).toEqual(["2000-01-01"]);
  });

  it("laisse modifier le reste du profil", async () => {
    const email = `${randomUUID()}@twitch.local`;

    await withApi(async (base) => {
      const signedUp = await signUp(base, email, "2000-01-01");
      const cookie = signedUp.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .join("; ");
      const update = await fetch(`${base}/auth/update-user`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: urlOf("BETTER_AUTH_URL"), cookie },
        body: JSON.stringify({ name: "Nouveau nom" }),
      });

      expect(update.status).toBe(200);
    });
    expect(await storedBirthDate(email)).toEqual(["2000-01-01"]);
  });
});
