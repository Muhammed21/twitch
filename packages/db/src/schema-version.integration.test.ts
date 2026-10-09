import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { beforeAll, describe, expect, it } from "vitest";

import { LATEST_MIGRATION } from "./generated/latest-migration.ts";
import { assertSchemaVersion } from "./index.ts";

const urlOf = (variable: string): string => {
  const url = process.env[variable];
  if (url === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return url;
};

const health = () => urlOf("DATABASE_URL_HEALTH");

const withFakeMigration = async (
  state: { finished: boolean; rolledBack: boolean },
  run: (name: string) => Promise<void>,
) => {
  const name = `29991231000000_fake_${randomUUID().replaceAll("-", "").slice(0, 8)}`;
  const client = new Client({ connectionString: urlOf("DATABASE_URL_MIGRATOR") });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at, finished_at, rolled_back_at, applied_steps_count)
       VALUES ($1, 'fake', $2, now(), $3, $4, 0)`,
      [
        randomUUID(),
        name,
        state.finished ? new Date() : null,
        state.rolledBack ? new Date() : null,
      ],
    );
    await run(name);
  } finally {
    await client.query("DELETE FROM _prisma_migrations WHERE migration_name = $1", [name]);
    await client.end();
  }
};

beforeAll(async () => {
  const client = new Client({ connectionString: urlOf("DATABASE_URL_MIGRATOR") });
  await client.connect();
  try {
    await client.query(
      "DELETE FROM _prisma_migrations WHERE migration_name LIKE '29991231000000\\_fake\\_%'",
    );
  } finally {
    await client.end();
  }
});

describe("assertSchemaVersion", () => {
  it("accepte une base où la dernière migration du code est appliquée", async () => {
    await expect(
      assertSchemaVersion({ connectionString: health(), migration: LATEST_MIGRATION }),
    ).resolves.toBeUndefined();
  });

  it("refuse une base en retard d'une migration, en la nommant", async () => {
    await expect(
      assertSchemaVersion({ connectionString: health(), migration: "29991231000000_a_venir" }),
    ).rejects.toThrow("29991231000000_a_venir");
  });

  it("refuse une migration commencée mais pas terminée", async () => {
    await withFakeMigration({ finished: false, rolledBack: false }, async (name) => {
      await expect(
        assertSchemaVersion({ connectionString: health(), migration: name }),
      ).rejects.toThrow(name);
    });
  });

  it("refuse une migration annulée", async () => {
    await withFakeMigration({ finished: true, rolledBack: true }, async (name) => {
      await expect(
        assertSchemaVersion({ connectionString: health(), migration: name }),
      ).rejects.toThrow(name);
    });
  });

  it("ne laisse aucune connexion ouverte, même quand il refuse", async () => {
    await expect(
      assertSchemaVersion({ connectionString: health(), migration: "29991231000000_a_venir" }),
    ).rejects.toThrow("29991231000000_a_venir");

    const client = new Client({ connectionString: urlOf("DATABASE_URL_MIGRATOR") });
    await client.connect();
    try {
      const { rows } = await client.query<{ open: string }>(
        "SELECT count(*) AS open FROM pg_stat_activity WHERE usename = 'app_health'",
      );
      expect(rows).toEqual([{ open: "0" }]);
    } finally {
      await client.end();
    }
  });

  it("abandonne une lecture bloquée par un verrou, au lieu d'attendre sans fin", async () => {
    const locker = new Client({ connectionString: urlOf("DATABASE_URL_MIGRATOR") });
    await locker.connect();
    try {
      await locker.query("BEGIN");
      await locker.query("LOCK TABLE _prisma_migrations IN ACCESS EXCLUSIVE MODE");
      const startedAt = performance.now();

      await expect(
        assertSchemaVersion({
          connectionString: health(),
          migration: LATEST_MIGRATION,
          queryTimeoutMillis: 300,
        }),
      ).rejects.toThrow("timeout");
      expect(performance.now() - startedAt).toBeLessThan(2000);
    } finally {
      await locker.query("ROLLBACK");
      await locker.end();
    }
  });

  it("accepte une migration terminée et non annulée", async () => {
    await withFakeMigration({ finished: true, rolledBack: false }, async (name) => {
      await expect(
        assertSchemaVersion({ connectionString: health(), migration: name }),
      ).resolves.toBeUndefined();
    });
  });
});
