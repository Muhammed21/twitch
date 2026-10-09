import { config } from "@repo/eslint-config/base";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    ignores: ["platforms/**", "reports/**", ".stryker-tmp/**"],
  },
];
