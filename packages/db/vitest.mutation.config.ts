import { defineConfig, mergeConfig } from "vitest/config";

import integration from "./vitest.integration.config.ts";

export default mergeConfig(
  integration,
  defineConfig({
    test: { include: ["src/**/*.test.ts"] },
  }),
);
