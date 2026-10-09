import { z } from "zod";

type JsonObject = { readonly [key: string]: unknown };

const SCHEMA_REF = "#/components/schemas/";
const OUTPUT_SUFFIX = "_Output";
const OPERATIONS = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);

const PROBLEM_RESPONSE = {
  description: "Erreur au format RFC 9457",
  content: { "application/problem+json": { schema: { $ref: `${SCHEMA_REF}Problem` } } },
};

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const child = (value: unknown, key: string): unknown => (isObject(value) ? value[key] : undefined);

const objectOr = (value: unknown): JsonObject => (isObject(value) ? value : {});

const entriesOf = (value: unknown): [string, unknown][] => Object.entries(objectOr(value));

const withoutOutputSuffix = (name: string): string =>
  name.endsWith(OUTPUT_SUFFIX) ? name.slice(0, -OUTPUT_SUFFIX.length) : name;

const renameRefsIn = (object: JsonObject): JsonObject =>
  Object.fromEntries(
    Object.entries(object).map(([key, entry]) => [
      key,
      key === "$ref" && typeof entry === "string" && entry.startsWith(SCHEMA_REF)
        ? `${SCHEMA_REF}${withoutOutputSuffix(entry.slice(SCHEMA_REF.length))}`
        : renameRefs(entry),
    ]),
  );

const renameRefs = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(renameRefs);
  }
  return isObject(value) ? renameRefsIn(value) : value;
};

const mapSchemas = (
  document: JsonObject,
  transform: (schemas: JsonObject) => JsonObject,
): JsonObject => {
  const schemas = child(document["components"], "schemas");
  if (!isObject(schemas)) {
    return document;
  }
  return {
    ...document,
    components: { ...objectOr(document["components"]), schemas: transform(schemas) },
  };
};

const mapOperations = (
  document: JsonObject,
  transform: (operation: JsonObject) => JsonObject,
): JsonObject => {
  const paths = document["paths"];
  if (!isObject(paths)) {
    return document;
  }
  return {
    ...document,
    paths: Object.fromEntries(
      Object.entries(paths).map(([path, item]) => [
        path,
        isObject(item)
          ? Object.fromEntries(
              Object.entries(item).map(([key, operation]) => [
                key,
                OPERATIONS.has(key) && isObject(operation) ? transform(operation) : operation,
              ]),
            )
          : item,
      ]),
    ),
  };
};

export const stripOutputSuffix = (document: JsonObject): JsonObject =>
  mapSchemas(renameRefsIn(document), (schemas) =>
    Object.fromEntries(
      Object.entries(schemas).map(([name, schema]) => [withoutOutputSuffix(name), schema]),
    ),
  );

export const withDefaultProblem = (document: JsonObject): JsonObject =>
  mapOperations(document, (operation) => ({
    ...operation,
    responses: {
      ...objectOr(operation["responses"]),
      default: PROBLEM_RESPONSE,
    },
  }));

const schemaNameOf = (response: unknown): string | undefined => {
  const target = child(
    child(child(child(response, "content"), "application/json"), "schema"),
    "$ref",
  );
  return typeof target === "string" && target.startsWith(SCHEMA_REF)
    ? target.slice(SCHEMA_REF.length)
    : undefined;
};

const successResponseRefs = (document: JsonObject): ReadonlySet<string | undefined> =>
  new Set(
    entriesOf(document["paths"]).flatMap(([, item]) =>
      entriesOf(item).flatMap(([, operation]) =>
        entriesOf(child(operation, "responses"))
          .filter(([status]) => status.startsWith("2"))
          .map(([, response]) => schemaNameOf(response)),
      ),
    ),
  );

export const openResponseRoots = (document: JsonObject): JsonObject => {
  const roots = successResponseRefs(document);
  return mapSchemas(document, (schemas) =>
    Object.fromEntries(
      Object.entries(schemas).map(([name, schema]) => [
        name,
        roots.has(name) &&
        isObject(schema) &&
        schema["type"] === "object" &&
        !("additionalProperties" in schema)
          ? { ...schema, additionalProperties: {} }
          : schema,
      ]),
    ),
  );
};

export const componentSchema = (name: string, schema: z.ZodType): unknown => {
  const definition = z.toJSONSchema(schema).$defs?.[name];
  if (definition === undefined) {
    throw new Error(`Schéma nommé introuvable : ${name}`);
  }
  return definition;
};

export const withComponent = (
  document: JsonObject,
  name: string,
  definition: unknown,
): JsonObject => {
  const components = objectOr(document["components"]);
  return {
    ...document,
    components: {
      ...components,
      schemas: { ...objectOr(components["schemas"]), [name]: definition },
    },
  };
};
