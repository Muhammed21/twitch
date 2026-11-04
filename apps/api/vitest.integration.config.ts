import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

import { defineConfig } from "vitest/config";

import { integrationEnv } from "./src/platform/testing/integration-env.ts";

const ROOT_ENV = new URL("../../.env", import.meta.url);

export default defineConfig({
  test: {
    include: ["src/**/*.integration.test.ts"],
    env: integrationEnv({
      dotenv: existsSync(ROOT_ENV) ? parseEnv(readFileSync(ROOT_ENV, "utf8")) : {},
      shell: process.env,
    }),
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
