import { Pool } from "pg";

import { createContextClient } from "@repo/db";

import { rebuildDiscoveryProjection } from "../modules/discovery/discovery.module.ts";
import { stdoutSink, writeLog } from "../platform/logging.ts";
import { loadRebuildEnv } from "./rebuild-env.ts";

try {
  const config = loadRebuildEnv(process.env);
  const pool = new Pool({ connectionString: config.outboxDatabaseUrl });
  const prisma = createContextClient({ context: "discovery", env: process.env });
  try {
    const report = await rebuildDiscoveryProjection({ pool, prisma });
    writeLog(stdoutSink, { level: "info", msg: "projection discovery reconstruite", ...report });
  } finally {
    await pool.end();
    await prisma.$disconnect();
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
