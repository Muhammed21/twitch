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

const storedUser = async (email: string) => {
  const client = new Client({ connectionString: urlOf("DATABASE_URL_MIGRATOR") });
  await client.connect();
  try {
    const { rows } = await client.query<{ name: string; password: string | null }>(
      `SELECT u."name", a."password"
         FROM "identity"."IdentityUser" u
         JOIN "identity"."IdentityAccount" a ON a."userId" = u."id"
        WHERE u."email" = $1`,
      [email],
    );
    return rows;
  } finally {
    await client.end();
  }
};

const makeAccount = () => ({
  name: "Streamer de test",
  email: `test-${randomUUID()}@twitch.local`,
  password: "un-mot-de-passe-solide-42",
});

describe("identity : better-auth monté sous /auth, contre la base locale migrée", () => {
  it("inscrit un compte par e-mail, sans stocker le mot de passe en clair", async () => {
    const account = makeAccount();

    await withApi(async (base) => {
      const response = await postJson(`${base}/auth/sign-up/email`, account);

      expect(response.status).toBe(200);
    });

    const rows = await storedUser(account.email);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe(account.name);
    expect(rows[0]?.password).not.toContain(account.password);
  });

  it("connecte le compte inscrit et pose un cookie de session", async () => {
    const account = makeAccount();

    await withApi(async (base) => {
      await postJson(`${base}/auth/sign-up/email`, account);
      const response = await postJson(`${base}/auth/sign-in/email`, {
        email: account.email,
        password: account.password,
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("set-cookie")).toMatch(/session_token=/);
    });
  });

  it("refuse un mot de passe faux", async () => {
    const account = makeAccount();

    await withApi(async (base) => {
      await postJson(`${base}/auth/sign-up/email`, account);
      const response = await postJson(`${base}/auth/sign-in/email`, {
        email: account.email,
        password: "pas-le-bon-mot-de-passe",
      });

      expect(response.status).toBe(401);
    });
  });

  it("ferme les connexions du contexte identity à l'arrêt de l'API", async () => {
    await withApi(async (base) => {
      await postJson(`${base}/auth/sign-up/email`, makeAccount());
    });

    const client = new Client({ connectionString: urlOf("DATABASE_URL_MIGRATOR") });
    await client.connect();
    try {
      const { rows } = await client.query<{ open: string }>(
        "SELECT count(*) AS open FROM pg_stat_activity WHERE usename = 'app_identity'",
      );
      expect(rows).toEqual([{ open: "0" }]);
    } finally {
      await client.end();
    }
  });

  it("garde l'analyse du JSON pour les routes /v1", async () => {
    await withApi(async (base) => {
      const response = await fetch(`${base}/v1/inconnue`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{ pas du json",
      });

      expect(response.status).toBe(400);
    });
  });
});
