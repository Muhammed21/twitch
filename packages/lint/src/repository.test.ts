import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { findArchitectureDisables } from "./scan.ts";

const ROOT = new URL("../../../", import.meta.url).pathname;

describe("le dépôt", () => {
  it("ne désactive aucune règle d'architecture, même là où oxlint ne peut pas le voir", () => {
    const files = execFileSync(
      "git",
      ["ls-files", "--", "*.ts", "*.tsx", "*.js", "*.mjs", "*.cjs"],
      { cwd: ROOT, encoding: "utf8" },
    )
      .split("\n")
      .filter((path) => path !== "")
      .map((path) => ({ path, code: readFileSync(join(ROOT, path), "utf8") }));

    expect(files.length).toBeGreaterThan(50);
    expect(findArchitectureDisables(files)).toEqual([]);
  });
});
