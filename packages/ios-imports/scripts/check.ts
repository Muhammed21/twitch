import { globSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { findImportViolations, importsVerdict } from "../src/imports.ts";

const root = resolve(import.meta.dirname, "../../..");
const ignored = new Set([".build", ".swiftpm", "DerivedData", "xcuserdata"]);

const paths = globSync("apps/ios/**/*.swift", {
  cwd: root,
  exclude: (name) => ignored.has(name),
}).toSorted();

const files = paths.map((path) => ({ path, code: readFileSync(resolve(root, path), "utf8") }));
const { ok, message } = importsVerdict({
  violations: findImportViolations(files),
  fileCount: files.length,
});

(ok ? process.stdout : process.stderr).write(`${message}\n`);
process.exitCode = ok ? 0 : 1;
