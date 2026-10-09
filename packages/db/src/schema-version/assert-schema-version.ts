import { Client } from "pg";

const DEFAULT_CONNECTION_TIMEOUT_MS = 2000;
const DEFAULT_QUERY_TIMEOUT_MS = 2000;

export const assertSchemaVersion = async ({
  connectionString,
  migration,
  connectionTimeoutMillis = DEFAULT_CONNECTION_TIMEOUT_MS,
  queryTimeoutMillis = DEFAULT_QUERY_TIMEOUT_MS,
}: {
  connectionString: string;
  migration: string;
  connectionTimeoutMillis?: number;
  queryTimeoutMillis?: number;
}): Promise<void> => {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis,
    query_timeout: queryTimeoutMillis,
  });
  await client.connect();
  try {
    const { rowCount } = await client.query(
      `SELECT 1 FROM _prisma_migrations
        WHERE migration_name = $1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL`,
      [migration],
    );
    if (rowCount === 0) {
      throw new Error(
        `Schéma en retard : la migration ${migration} n'est pas appliquée. Lancer le job de migration avant l'application.`,
      );
    }
  } finally {
    await client.end();
  }
};
