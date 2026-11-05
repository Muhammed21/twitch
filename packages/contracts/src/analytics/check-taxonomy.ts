import { z } from "zod";

import { camelCase, SWIFT_RESERVED_WORDS } from "./naming.ts";

export type EventSource = "client" | "server";

export type EventDefinition = {
  readonly source: EventSource;
  readonly properties: z.ZodObject;
};

export type Taxonomy = Readonly<Record<string, EventDefinition>>;

export type PropertyType =
  | { readonly kind: "string" }
  | { readonly kind: "integer" }
  | { readonly kind: "boolean" }
  | { readonly kind: "enum"; readonly values: readonly string[] };

export type Property = {
  readonly key: string;
  readonly type: PropertyType | undefined;
  readonly isRequired: boolean;
};

export type SupportedProperty = Property & { readonly type: PropertyType };

export const isSupported = (property: Property): property is SupportedProperty =>
  property.type !== undefined;

export const FORBIDDEN_PROPERTY_KEYS = [
  "email",
  "phone",
  "name",
  "address",
  "ip",
  "token",
  "password",
] as const;

const SNAKE_CASE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const SNAKE_WORD = "[a-z][a-z0-9]*(?:_[a-z0-9]+)*";
const EVENT_NAME = new RegExp(`^${SNAKE_WORD}:${SNAKE_WORD}$`);
const BOOLEAN_PREFIXES = ["is_", "has_"] as const;

const UNSUPPORTED = "type non pris en charge (chaîne, entier, booléen ou énumération)";

const JsonProperty = z
  .object({
    type: z.string().optional(),
    enum: z.array(z.string()).optional(),
  })
  .catch({});

const JsonObject = z.object({ additionalProperties: z.unknown() });

const jsonSchemaOf = (schema: z.ZodType): unknown =>
  z.toJSONSchema(schema, { unrepresentable: "any" });

const typeOf = (schema: z.ZodType): PropertyType | undefined => {
  const { type, enum: values } = JsonProperty.parse(jsonSchemaOf(schema));
  if (values !== undefined) return { kind: "enum", values };
  if (type === "string" || type === "integer" || type === "boolean") return { kind: type };
  return undefined;
};

const isClosed = (properties: z.ZodObject): boolean =>
  JsonObject.parse(jsonSchemaOf(properties)).additionalProperties === false;

export const propertiesOf = (properties: z.ZodObject): readonly Property[] =>
  Object.entries(properties.shape).map(([key, schema]) => ({
    key,
    type: typeOf(schema),
    isRequired: !schema.safeParse(undefined).success,
  }));

const isPii = (key: string): boolean =>
  key.split("_").some((word) => FORBIDDEN_PROPERTY_KEYS.some((forbidden) => forbidden === word));

const propertyViolations = (event: string, property: Property): readonly string[] => {
  const { key, type, isRequired } = property;
  const at = `${event}.${key}`;
  return [
    ...(SNAKE_CASE.test(key) ? [] : [`${at} : propriété hors du snake_case`]),
    ...(SWIFT_RESERVED_WORDS.has(key) ? [`${at} : mot réservé en Swift`] : []),
    ...(isPii(key) ? [`${at} : clé PII interdite`] : []),
    ...(isSupported(property) ? [] : [`${at} : ${UNSUPPORTED}`]),
    ...(isRequired ? [] : [`${at} : propriété facultative`]),
    ...(type?.kind === "boolean" && !BOOLEAN_PREFIXES.some((prefix) => key.startsWith(prefix))
      ? [`${at} : booléen sans préfixe is_ ou has_`]
      : []),
    ...(type?.kind === "enum"
      ? type.values
          .filter((value) => !SNAKE_CASE.test(value))
          .map((value) => `${at} : valeur ${value} hors du snake_case`)
      : []),
    ...(type?.kind === "enum"
      ? type.values
          .filter((value) => SWIFT_RESERVED_WORDS.has(value))
          .map((value) => `${at} : valeur ${value}, mot réservé en Swift`)
      : []),
  ];
};

const eventViolations = (event: string, { properties }: EventDefinition): readonly string[] => [
  ...(EVENT_NAME.test(event) ? [] : [`${event} : nom hors de la convention objet:action_au_passé`]),
  ...(isClosed(properties) ? [] : [`${event} : propriétés ouvertes, attendu z.strictObject`]),
  ...propertiesOf(properties).flatMap((property) => propertyViolations(event, property)),
];

const identifierCollisions = (events: Taxonomy): readonly string[] => {
  const names = Object.keys(events);
  return names.flatMap((event, index) => {
    const identifier = camelCase(event);
    const first = names.slice(0, index).find((other) => camelCase(other) === identifier);
    return first === undefined
      ? []
      : [`${event} : même identifiant Swift ${identifier} que ${first}`];
  });
};

type EnumProperty = { readonly event: string; readonly key: string; readonly values: string };

const enumProperties = (events: Taxonomy): readonly EnumProperty[] =>
  Object.entries(events).flatMap(([event, { properties }]) =>
    propertiesOf(properties).flatMap(({ key, type }) =>
      type?.kind === "enum" ? [{ event, key, values: JSON.stringify(type.values) }] : [],
    ),
  );

const enumMismatches = (events: Taxonomy): readonly string[] => {
  const enums = enumProperties(events);
  return enums.flatMap((property) =>
    enums
      .filter(({ key }) => key === property.key)
      .slice(0, 1)
      .filter(({ values }) => values !== property.values)
      .map(
        (first) =>
          `${property.event}.${property.key} : valeurs différentes de ${first.event}.${first.key}`,
      ),
  );
};

export const findTaxonomyViolations = (events: Taxonomy): readonly string[] => [
  ...Object.entries(events).flatMap(([event, definition]) => eventViolations(event, definition)),
  ...identifierCollisions(events),
  ...enumMismatches(events),
];
