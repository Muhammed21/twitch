import { describe, expect, it } from "vitest";

import { databaseOptions } from "./database";

const URL = "postgresql://payload:secret@postgres:5432/payload";

describe("la base de Payload (ADR 0028 §4)", () => {
  it("se connecte avec PAYLOAD_DATABASE_URL", () => {
    expect(databaseOptions({ PAYLOAD_DATABASE_URL: URL }).pool.connectionString).toBe(URL);
  });

  it("ne migre jamais au démarrage : les migrations passent par payload migrate", () => {
    expect(databaseOptions({ PAYLOAD_DATABASE_URL: URL })).not.toHaveProperty("prodMigrations");
  });

  it("ne pousse jamais le schéma en développement", () => {
    expect(databaseOptions({ PAYLOAD_DATABASE_URL: URL }).push).toBe(false);
  });

  it("lit ses migrations dans src/migrations", () => {
    expect(databaseOptions({ PAYLOAD_DATABASE_URL: URL }).migrationDir).toMatch(
      /apps\/payload\/src\/migrations$/,
    );
  });

  it("se construit sans base configurée, pour que next build ne la joigne pas", () => {
    expect(databaseOptions({}).pool.connectionString).toBe("");
  });
});
