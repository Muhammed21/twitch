import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import internals from "@prisma/internals";

import type { PrismaSchema, SchemaField } from "../../src/schema-lint/lint-schema.ts";

// Seul fichier du dépôt à importer @prisma/internals, API interne de Prisma (ADR 0025 §5).
// Prisma est épinglé : une montée de version rejoue les tests de fixtures de ce dossier.

const ENUM_WITH_SCHEMA = /^enum\s+(\w+)\s*\{[^}]*@@schema\("([^"]+)"\)/gm;

const enumSchemas = (files: readonly (readonly [string, string])[]): ReadonlyMap<string, string> =>
  new Map(
    files.flatMap(([, content]) =>
      [...content.matchAll(ENUM_WITH_SCHEMA)].map((match) => [String(match[1]), String(match[2])]),
    ),
  );

const readSchemaFiles = async (directory: string) => {
  const entries = await readdir(directory, { recursive: true });
  const paths = entries.filter((entry) => entry.endsWith(".prisma")).toSorted();
  return Promise.all(
    paths.map(async (path) => [path, await readFile(join(directory, path), "utf8")] as const),
  );
};

export const readPrismaSchema = async (directory: string): Promise<PrismaSchema> => {
  const files = await readSchemaFiles(directory);
  const { datamodel } = await internals.getDMMF({
    datamodel: files.map(([path, content]) => [path, content]),
  });
  const schemaOfEnum = enumSchemas(files);
  return {
    models: datamodel.models.map((model) => ({
      name: model.name,
      schema: String(model.schema),
      fields: model.fields.map((field): SchemaField => ({
        name: field.name,
        kind: field.kind,
        type: field.type,
        documentation: field.documentation,
      })),
    })),
    enums: datamodel.enums.map((item) => ({
      name: item.name,
      schema: String(schemaOfEnum.get(item.name)),
    })),
  };
};
