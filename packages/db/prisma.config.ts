import { existsSync } from "node:fs";

import { defineConfig } from "prisma/config";

const ROOT_ENV = "../../.env";

if (existsSync(ROOT_ENV)) {
  process.loadEnvFile(ROOT_ENV);
}

export default defineConfig({
  schema: "prisma/schema",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL_MIGRATOR"] ?? "",
  },
});
