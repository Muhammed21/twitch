import path from "node:path";
import { fileURLToPath } from "node:url";

const migrationDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "migrations");

type DatabaseEnvironment = { readonly PAYLOAD_DATABASE_URL?: string | undefined };

export const databaseOptions = (env: DatabaseEnvironment) => ({
  pool: { connectionString: env.PAYLOAD_DATABASE_URL ?? "" },
  migrationDir,
  push: false,
});
