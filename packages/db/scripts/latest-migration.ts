import { mkdir, readdir, writeFile } from "node:fs/promises";

import { latestMigration } from "../src/schema-version/latest-migration.ts";

const MIGRATIONS = new URL("../prisma/migrations/", import.meta.url);
const OUTPUT_DIRECTORY = new URL("../src/generated/", import.meta.url);

const latest = latestMigration(await readdir(MIGRATIONS));

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
await writeFile(
  new URL("latest-migration.ts", OUTPUT_DIRECTORY),
  `export const LATEST_MIGRATION = ${JSON.stringify(latest)};\n`,
);
