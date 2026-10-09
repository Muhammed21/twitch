import { spawnSync } from "node:child_process";

import { Client } from "pg";

import { assertRolesProvisioned } from "../src/index.ts";

const listRoles = async (): Promise<readonly string[]> => {
  const client = new Client({ connectionString: process.env["DATABASE_URL_MIGRATOR"] });
  await client.connect();
  try {
    const { rows } = await client.query<{ rolname: string }>("SELECT rolname FROM pg_roles");
    return rows.map((row) => row.rolname);
  } finally {
    await client.end();
  }
};

await assertRolesProvisioned({ listRoles });

const { status } = spawnSync("prisma", ["migrate", "deploy"], { stdio: "inherit" });
process.exitCode = status ?? 1;
