import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.integration.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/main.ts",
        "src/openapi/generate.ts",
        "src/create-app.ts",
        "src/app.module.ts",
        "src/modules/*/infrastructure/**",
        "src/modules/*/*.module.ts",
        "src/authz/authz-context.ts",
        "src/outbox-relay/outbox-relay.ts",
        "src/outbox-relay/main.ts",
        "src/discovery-rebuild/main.ts",
        "src/platform/testing/**",
        "src/platform/stream-consumer.ts",
        "src/platform/redis-window-counter.ts",
        "src/platform/images/images.module.ts",
        "src/platform/images/infrastructure/**",
        "src/platform/images/testing/**",
      ],
      reporter: ["text"],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
