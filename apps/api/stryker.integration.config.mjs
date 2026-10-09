import base from "./stryker.config.mjs";

/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
  ...base,
  vitest: { configFile: "vitest.mutation.config.ts" },
  mutate: ["src/modules/*/infrastructure/**/*.ts", "src/modules/*/*.module.ts"],
  coverageAnalysis: "off",
  inPlace: true,
  concurrency: 1,
  htmlReporter: { fileName: "reports/mutation-integration/index.html" },
};
