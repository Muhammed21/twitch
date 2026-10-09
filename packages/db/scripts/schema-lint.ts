import { writeFile } from "node:fs/promises";

import { lintSchema, personalInventory } from "../src/schema-lint/lint-schema.ts";
import { readPrismaSchema } from "./schema-lint/read-prisma-schema.ts";

const SCHEMA_DIRECTORY = new URL("../prisma/schema/", import.meta.url).pathname;
const INVENTORY = new URL("../personal-fields.json", import.meta.url);

const schema = await readPrismaSchema(SCHEMA_DIRECTORY);
const violations = lintSchema(schema);

if (violations.length > 0) {
  violations.forEach((violation) =>
    console.error(`schema-lint [${violation.rule}] ${violation.message}`),
  );
  process.exitCode = 1;
} else {
  await writeFile(INVENTORY, `${JSON.stringify(personalInventory(schema), null, 2)}\n`);
}
