import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

import { catalogVerdict, isCatalogued, parsePage, renderCatalog } from "../src/catalog.ts";

const docsRoot = resolve(import.meta.dirname, "../../../docs");
const catalogFile = join(docsRoot, "CATALOG.md");

const entries = await readdir(docsRoot, { recursive: true, withFileTypes: true });
const relPaths = entries
  .filter((entry) => entry.isFile())
  .map((entry) => relative(docsRoot, join(entry.parentPath, entry.name)).split(sep).join("/"))
  .filter(isCatalogued)
  .toSorted();

const pages = await Promise.all(
  relPaths.map(async (relPath) =>
    parsePage({ relPath, text: await readFile(join(docsRoot, relPath), "utf8") }),
  ),
);
const expected = renderCatalog(pages);

if (process.argv.includes("--check")) {
  const committed = await readFile(catalogFile, "utf8").catch(() => undefined);
  const { ok, message } = catalogVerdict({ committed, expected, pageCount: pages.length });
  (ok ? process.stdout : process.stderr).write(`${message}\n`);
  process.exitCode = ok ? 0 : 1;
} else {
  await writeFile(catalogFile, expected);
  process.stdout.write(`docs/CATALOG.md généré (${pages.length} pages).\n`);
}
