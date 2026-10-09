import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    benchmark: {
      include: ["bench/**/*.bench.ts"],
      outputJson: "bench-results.json",
    },
  },
});
