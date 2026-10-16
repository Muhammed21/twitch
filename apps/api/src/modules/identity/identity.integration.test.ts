import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { createClient } from "redis";
import { describe, expect, it, vi } from "vitest";

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

const asMigrator = async <T>(run: (client: Client) => Promise<T>): Promise<T> => {
  const client = new Client({ connectionString: urlOf("DATABASE_URL_MIGRATOR") });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
};

type OutboxRow = {
  id: string;
  name: string;
  version: number;
  payload: unknown;
  publishedAt: Date | null;
};

const outboxOf = (accountId: string) =>
  asMigrator(async (client) => {
    const { rows } = await client.query<OutboxRow>(
      `SELECT "id", "name", "version", "payload", "publishedAt"
         FROM "identity"."IdentityOutbox" WHERE "payload"->>'accountId' = $1`,
      [accountId],
    );
    return rows;
  });

const outboxCount = () =>
  asMigrator(async (client) => {
    const { rows } = await client.query<{ count: string }>(
      `SELECT count(*) AS "count" FROM "identity"."IdentityOutbox"`,
    );
    return Number(rows[0]?.count);
  });

const userIdOf = (email: string) =>
  asMigrator(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `SELECT "id" FROM "identity"."IdentityUser" WHERE "email" = $1`,
      [email],
    );
    return rows[0]?.id;
  });

const FAILING_ACCOUNT_PREFIX = "echec-compte-";

const withFailingAccountWrite = async (run: () => Promise<void>) => {
  await asMigrator((client) =>
    client.query(`
      CREATE OR REPLACE FUNCTION "identity"."test_fail_account"() RETURNS trigger AS $$
      BEGIN
        IF EXISTS (SELECT 1 FROM "identity"."IdentityUser"
                    WHERE "id" = NEW."userId" AND "email" LIKE '${FAILING_ACCOUNT_PREFIX}%') THEN
          RAISE EXCEPTION 'écriture du compte refusée par le test';
        END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql;
      CREATE TRIGGER "test_fail_account" BEFORE INSERT ON "identity"."IdentityAccount"
        FOR EACH ROW EXECUTE FUNCTION "identity"."test_fail_account"();
    `),
  );
  try {
    await run();
  } finally {
    await asMigrator((client) =>
      client.query(`
        DROP TRIGGER IF EXISTS "test_fail_account" ON "identity"."IdentityAccount";
        DROP FUNCTION IF EXISTS "identity"."test_fail_account"();
      `),
    );
  }
};

const makeAccount = () => ({
  name: "Streamer de test",
  email: `test-${randomUUID()}@twitch.local`,
  password: "un-mot-de-passe-solide-42",
  birthDate: "2000-01-01",
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

  it("écrit identity.account.registered dans l'outbox à l'inscription", async () => {
    const account = makeAccount();

    await withApi(async (base) => {
      await postJson(`${base}/auth/sign-up/email`, account);
    });

    const accountId = await userIdOf(account.email);
    expect(await outboxOf(accountId ?? "")).toEqual([
      {
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        name: "identity.account.registered",
        version: 1,
        payload: { accountId, displayName: account.name },
        publishedAt: null,
      },
    ]);
  });

  it("n'écrit ni compte ni event quand l'inscription échoue en cours de transaction", async () => {
    const account = {
      ...makeAccount(),
      email: `${FAILING_ACCOUNT_PREFIX}${randomUUID()}@twitch.local`,
    };
    const before = await outboxCount();

    await withFailingAccountWrite(async () => {
      await withApi(async (base) => {
        const response = await postJson(`${base}/auth/sign-up/email`, account);

        expect(response.status).toBeGreaterThanOrEqual(400);
      });
    });

    expect(await userIdOf(account.email)).toBeUndefined();
    expect(await outboxCount()).toBe(before);
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

  it("ferme sa connexion Redis à l'arrêt de l'API", async () => {
    const redis = await createClient({ url: urlOf("REDIS_URL") }).connect();
    const apiClient = expect.objectContaining({ name: "api-identity" });
    try {
      await withApi(async () => {
        await vi.waitFor(async () => expect(await redis.clientList()).toContainEqual(apiClient));
      });

      await vi.waitFor(async () => expect(await redis.clientList()).not.toContainEqual(apiClient));
    } finally {
      redis.destroy();
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
