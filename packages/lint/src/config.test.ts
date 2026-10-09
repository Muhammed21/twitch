import { execFile } from "node:child_process";
import { globSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const ROOT = new URL("../../../", import.meta.url).pathname;
const OXLINT = join(ROOT, "node_modules/.bin/oxlint");

type Override = { files: string[]; rules: Record<string, unknown> };
type OxlintConfig = {
  jsPlugins?: string[];
  rules: Record<string, unknown>;
  overrides: Override[];
};

const readConfig = (): OxlintConfig =>
  JSON.parse(readFileSync(join(ROOT, ".oxlintrc.json"), "utf8"));

const matches = (pattern: string) =>
  globSync(pattern, { cwd: ROOT, exclude: (path) => path.includes("node_modules") });

describe("le linter est linté (ADR 0018, ADR 0029)", () => {
  it.each(readConfig().overrides.flatMap(({ files }) => files))(
    "le motif %s correspond à au moins un fichier",
    (pattern) => {
      expect(matches(pattern).length).toBeGreaterThan(0);
    },
  );

  it.each(readConfig().jsPlugins ?? [])("le plugin %s existe", (plugin) => {
    expect(matches(plugin)).toHaveLength(1);
  });

  it.each(["module-boundaries", "layer-dependencies", "no-disable-architecture"])(
    "la règle twitch/%s est active en erreur",
    (rule) => {
      expect(readConfig().rules[`twitch/${rule}`]).toBe("error");
    },
  );
});

const lintTree = async (files: Record<string, string>) => {
  const directory = await mkdtemp(join(tmpdir(), "architecture-"));
  const config = readConfig();
  await writeFile(
    join(directory, ".oxlintrc.json"),
    JSON.stringify({
      ...config,
      $schema: undefined,
      jsPlugins: (config.jsPlugins ?? []).map((plugin) => join(ROOT, plugin)),
    }),
  );
  await Promise.all(
    Object.entries(files).map(async ([path, code]) => {
      await mkdir(dirname(join(directory, path)), { recursive: true });
      await writeFile(join(directory, path), code);
    }),
  );
  return promisify(execFile)(OXLINT, ["-c", join(directory, ".oxlintrc.json"), directory]).then(
    ({ stdout }) => ({ code: 0, output: stdout }),
    (error: { code?: number; stdout?: string }) => ({
      code: error.code,
      output: error.stdout ?? "",
    }),
  );
};

const IDENTITY = "apps/api/src/modules/identity";

describe("règles d'architecture, avec la vraie configuration", () => {
  it.each([
    [
      "un domaine qui importe NestJS",
      `${IDENTITY}/domain/bad.ts`,
      'import { Injectable } from "@nestjs/common";\nexport const a = Injectable;\n',
      "no-restricted-imports",
    ],
    [
      "un domaine qui importe Zod",
      `${IDENTITY}/domain/bad.ts`,
      'import { z } from "zod";\nexport const a = z;\n',
      "no-restricted-imports",
    ],
    [
      "un domaine qui importe @repo/db",
      `${IDENTITY}/domain/bad.ts`,
      'import { contexts } from "@repo/db";\nexport const a = contexts;\n',
      "no-restricted-imports",
    ],
    [
      "un import vers un autre module",
      "apps/api/src/modules/channel/domain/bad.ts",
      'import { a } from "../../identity/domain/account-id.ts";\nexport const b = a;\n',
      "twitch(module-boundaries)",
    ],
    [
      "une couche interdite",
      `${IDENTITY}/domain/bad.ts`,
      'import { a } from "../application/use-case.ts";\nexport const b = a;\n',
      "twitch(layer-dependencies)",
    ],
    [
      "un commentaire de désactivation",
      `${IDENTITY}/domain/bad.ts`,
      "// oxlint-disable-next-line twitch/layer-dependencies\nexport const a = 1;\n",
      "twitch(no-disable-architecture)",
    ],
  ])("refuse %s", async (_name, path, code, rule) => {
    const { code: exitCode, output } = await lintTree({ [path]: code });

    expect(exitCode).toBe(1);
    expect(output).toContain(rule);
  });

  it("accepte un module conforme", async () => {
    const { code, output } = await lintTree({
      [`${IDENTITY}/domain/account-id.ts`]:
        'import { ok } from "@repo/result";\nexport const a = ok;\n',
      [`${IDENTITY}/application/use-case.ts`]:
        'import { a } from "../domain/account-id.ts";\nexport const b = a;\n',
      [`${IDENTITY}/presentation/controller.ts`]:
        'import { Controller } from "@nestjs/common";\nimport { b } from "../application/use-case.ts";\nexport const c = [Controller, b];\n',
    });

    expect(output).not.toMatch(/twitch\(|no-restricted-imports/);
    expect(code).toBe(0);
  });
});
