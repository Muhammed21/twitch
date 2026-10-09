/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  plugins: ["@stryker-mutator/vitest-runner"],
  coverageAnalysis: "perTest",
  reporters: ["clear-text", "progress", "html"],
  htmlReporter: { fileName: "reports/mutation/index.html" },
  mutate: [
    "src/**/*.ts",
    "!src/**/*.test.ts",
    "!src/main.ts",
    "!src/create-app.ts",
    "!src/app.module.ts",
  ],
  tsconfigFile: "stryker-skips-tsconfig-rewrite.json",
  thresholds: { high: 100, low: 90, break: null },
};
