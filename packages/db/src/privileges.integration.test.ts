import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

import { Client, DatabaseError } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type Context, contexts } from "./index.ts";

const PERMISSION_DENIED = "42501";
const AUTHZ_WRITERS: readonly Context[] = ["channel", "moderation"];
const SHARED_SCHEMAS = ["authz", "audit"] as const;
const SCHEMAS = [...contexts, ...SHARED_SCHEMAS];
const PROBE = `probe_${randomUUID().replaceAll("-", "")}`;

const urlOf = (variable: string): string => {
  const url = process.env[variable];
  if (url === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return url;
};

const contextUrl = (context: Context) => urlOf(`DATABASE_URL_${context.toUpperCase()}`);

const asRole = async <T>(url: string, run: (client: Client) => Promise<T>): Promise<T> => {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
};

const outcome = async (url: string, sql: string): Promise<string> =>
  asRole(url, (client) => client.query(sql)).then(
    () => "ok",
    (error: unknown) =>
      error instanceof DatabaseError && error.code !== undefined ? error.code : String(error),
  );

const probe = (schema: string) => `"${schema}"."${PROBE}"`;

const crud = (schema: string) => ({
  select: `SELECT * FROM ${probe(schema)}`,
  insert: `INSERT INTO ${probe(schema)} (label) VALUES ('x')`,
  update: `UPDATE ${probe(schema)} SET label = 'y'`,
  delete: `DELETE FROM ${probe(schema)}`,
});

const otherContext = (context: Context): Context =>
  contexts[(contexts.indexOf(context) + 1) % contexts.length] ?? context;

beforeAll(async () => {
  await asRole(urlOf("DATABASE_URL_MIGRATOR"), async (client) => {
    for (const schema of SCHEMAS) {
      await client.query(
        `CREATE TABLE ${probe(schema)} (id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, label text)`,
      );
    }
  });
});

afterAll(async () => {
  await asRole(urlOf("DATABASE_URL_MIGRATOR"), async (client) => {
    for (const schema of SCHEMAS) {
      await client.query(`DROP TABLE IF EXISTS ${probe(schema)}`);
    }
  });
});

describe("schéma d'un contexte, sur une table créée par migrator après la migration", () => {
  it.each(contexts)("app_%s lit et écrit son schéma sans GRANT explicite", async (context) => {
    const sql = crud(context);

    expect(await outcome(contextUrl(context), sql.insert)).toBe("ok");
    expect(await outcome(contextUrl(context), sql.select)).toBe("ok");
    expect(await outcome(contextUrl(context), sql.update)).toBe("ok");
    expect(await outcome(contextUrl(context), sql.delete)).toBe("ok");
  });

  it.each(contexts)("app_%s reçoit 42501 sur le schéma d'un autre contexte", async (context) => {
    expect(await outcome(contextUrl(context), crud(otherContext(context)).select)).toBe(
      PERMISSION_DENIED,
    );
  });
});

describe("schéma audit", () => {
  it.each(contexts)("app_%s ajoute et lit une entrée", async (context) => {
    expect(await outcome(contextUrl(context), crud("audit").insert)).toBe("ok");
    expect(await outcome(contextUrl(context), crud("audit").select)).toBe("ok");
  });

  it.each(contexts)("app_%s ne modifie ni ne supprime une entrée", async (context) => {
    expect(await outcome(contextUrl(context), crud("audit").update)).toBe(PERMISSION_DENIED);
    expect(await outcome(contextUrl(context), crud("audit").delete)).toBe(PERMISSION_DENIED);
  });
});

describe("schéma authz", () => {
  it.each(contexts)("app_%s lit les attributions", async (context) => {
    expect(await outcome(contextUrl(context), crud("authz").select)).toBe("ok");
  });

  it.each(AUTHZ_WRITERS)("app_%s ajoute et modifie une attribution", async (context) => {
    expect(await outcome(contextUrl(context), crud("authz").insert)).toBe("ok");
    expect(await outcome(contextUrl(context), crud("authz").update)).toBe("ok");
  });

  it.each(contexts.filter((context) => !AUTHZ_WRITERS.includes(context)))(
    "app_%s n'écrit pas d'attribution",
    async (context) => {
      expect(await outcome(contextUrl(context), crud("authz").insert)).toBe(PERMISSION_DENIED);
      expect(await outcome(contextUrl(context), crud("authz").update)).toBe(PERMISSION_DENIED);
    },
  );

  it.each(contexts)("app_%s ne supprime pas d'attribution", async (context) => {
    expect(await outcome(contextUrl(context), crud("authz").delete)).toBe(PERMISSION_DENIED);
  });
});

describe("rôles techniques", () => {
  it("app_health lit la table des migrations de Prisma", async () => {
    expect(
      await outcome(urlOf("DATABASE_URL_HEALTH"), "SELECT migration_name FROM _prisma_migrations"),
    ).toBe("ok");
  });

  it.each(["DATABASE_URL_HEALTH", "DATABASE_URL_OUTBOX_RELAY"])(
    "%s ne lit aucun schéma de contexte",
    async (variable) => {
      expect(await outcome(urlOf(variable), crud("identity").select)).toBe(PERMISSION_DENIED);
    },
  );
});

describe("migrate deploy", () => {
  it("rejoué sur une base à jour, n'applique rien", async () => {
    const { stdout } = await promisify(execFile)("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      env: process.env,
    });

    expect(stdout).toContain("No pending migrations to apply");
  });
});
