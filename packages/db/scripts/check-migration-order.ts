import { execFileSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  checkMigrationOrder,
  type Migration,
} from "../src/migration-order/check-migration-order.ts";
import { MIGRATION_DIRECTORY } from "../src/schema-version/latest-migration.ts";

const MIGRATIONS = fileURLToPath(new URL("../prisma/migrations/", import.meta.url));

const git = (args: readonly string[]): string =>
  execFileSync("git", args, { cwd: MIGRATIONS, encoding: "utf8" });

const currentMigrations = async (): Promise<readonly Migration[]> => {
  const names = (await readdir(MIGRATIONS))
    .filter((entry) => MIGRATION_DIRECTORY.test(entry))
    .toSorted();
  const checksums = git(["hash-object", ...names.map((name) => `${name}/migration.sql`)])
    .trim()
    .split("\n");
  return names.map((name, index) => ({ name, checksum: checksums[index] ?? "" }));
};

const baseMigrations = (ref: string): readonly Migration[] =>
  git(["ls-tree", "-r", ref, "."])
    .split("\n")
    .map((line) => /^\S+ blob (\S+)\t([^/]+)\/migration\.sql$/.exec(line))
    .flatMap((match) => (match?.[1] && match[2] ? [{ name: match[2], checksum: match[1] }] : []))
    .filter(({ name }) => MIGRATION_DIRECTORY.test(name));

const baseRef = process.argv[2];
const problems = checkMigrationOrder({
  current: await currentMigrations(),
  base: baseRef === undefined ? [] : baseMigrations(baseRef),
});

problems.forEach((problem) => console.error(`::error::${problem}`));
process.exitCode = problems.length > 0 ? 1 : 0;
