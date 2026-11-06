import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const APP = new URL("../", import.meta.url).pathname;

const sources = () =>
  globSync(["src/**/*.{ts,tsx,js,scss,css}", "*.ts", "*.mjs"], {
    cwd: APP,
    exclude: (path) => path.includes("node_modules") || path.includes(".next"),
  }).filter((path) => !path.endsWith(".test.ts"));

describe("Payload se construit une fois pour tous les environnements (ADR 0028 §7)", () => {
  it("trouve les sources de l'app", () => {
    expect(sources().length).toBeGreaterThan(5);
  });

  it("ne lit aucune variable NEXT_PUBLIC_*, figée par next build", () => {
    const offenders = sources().filter((path) =>
      readFileSync(join(APP, path), "utf8").includes("NEXT_PUBLIC_"),
    );

    expect(offenders).toEqual([]);
  });

  it("rend ses routes dynamiques, sans génération statique qui interroge la base", () => {
    const layout = readFileSync(join(APP, "src/app/(payload)/layout.tsx"), "utf8");

    expect(layout).toContain('export const dynamic = "force-dynamic"');
  });
});
