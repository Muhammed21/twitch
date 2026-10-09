import base from "./stryker.config.mjs";

/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
  ...base,
  vitest: { configFile: "vitest.mutation.config.ts" },
  coverageAnalysis: "off",
  inPlace: true,
  mutate: ["src/outbox.ts", "src/schema-version/assert-schema-version.ts"],
  concurrency: 1,
  htmlReporter: { fileName: "reports/mutation-integration/index.html" },
};
