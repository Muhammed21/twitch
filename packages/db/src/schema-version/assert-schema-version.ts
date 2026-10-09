import { Client } from "pg";

export const assertSchemaVersion = async ({
  connectionString,
  migration,
}: {
  connectionString: string;
  migration: string;
}): Promise<void> => {
  const client = new Client({ connectionString });
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
