/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  plugins: ["@stryker-mutator/vitest-runner"],
  coverageAnalysis: "perTest",
  reporters: ["clear-text", "progress", "html"],
  htmlReporter: { fileName: "reports/mutation/index.html" },
  mutate: [
    "src/**/*.ts",
    "scripts/schema-lint/read-prisma-schema.ts",
    "!src/**/*.test.ts",
    "!src/generated/**",
    "!src/outbox.ts",
    "!src/schema-version/assert-schema-version.ts",
  ],
  tsconfigFile: "stryker-skips-tsconfig-rewrite.json",
  thresholds: { high: 100, low: 90, break: null },
};
