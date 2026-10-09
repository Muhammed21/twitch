export type SchemaField = {
  readonly name: string;
  readonly kind: "scalar" | "enum" | "object" | "unsupported";
  readonly type: string;
  readonly documentation?: string;
};

export type SchemaModel = {
  readonly name: string;
  readonly schema: string;
  readonly fields: readonly SchemaField[];
  readonly uniqueKeys: readonly (readonly string[])[];
};

export type SchemaEnum = {
  readonly name: string;
  readonly schema: string;
};

export type PrismaSchema = {
  readonly models: readonly SchemaModel[];
  readonly enums: readonly SchemaEnum[];
};

export type Violation = {
  readonly rule:
    | "cross-schema-relation"
    | "cross-schema-enum"
    | "context-prefix"
    | "personal-annotation"
    | "technical-shape";
  readonly message: string;
};

const PERSONAL = "@personal";
const NOT_PERSONAL = "@not-personal";

const PERSONAL_WORDS = new Set(["email", "ip", "phone", "avatar", "birth", "username"]);

const PERSONAL_PAIRS = new Set([
  "display name",
  "first name",
  "last name",
  "full name",
  "user name",
  "user id",
  "account id",
  "follower id",
  "viewer id",
  "streamer id",
  "broadcaster id",
  "actor id",
  "author id",
  "owner id",
  "moderator id",
  "subscriber id",
  "sender id",
  "recipient id",
  "reporter id",
  "target id",
]);

const words = (name: string): readonly string[] =>
  name
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(" ");

const looksPersonal = (name: string): boolean => {
  const fieldWords = words(name);
  return (
    fieldWords.some((word) => PERSONAL_WORDS.has(word)) ||
    PERSONAL_PAIRS.has(fieldWords.slice(-2).join(" "))
  );
};

const annotations = (field: SchemaField): ReadonlySet<string> =>
  new Set(field.documentation?.match(/\S+/g));

const prefixOf = (schema: string) => `${schema.charAt(0).toUpperCase()}${schema.slice(1)}`;

const hasPrefix = (name: string, prefix: string): boolean =>
  name.startsWith(prefix) && /^(?:$|[A-Z])/.test(name.slice(prefix.length));

const prefixViolation = (item: { name: string; schema: string }): readonly Violation[] =>
  hasPrefix(item.name, prefixOf(item.schema))
    ? []
    : [
        {
          rule: "context-prefix",
          message: `${item.schema}.${item.name} : le nom doit commencer par ${prefixOf(item.schema)}`,
        },
      ];

const crossSchemaViolation = (
  where: string,
  model: SchemaModel,
  field: SchemaField,
  target: string,
): Violation =>
  field.kind === "enum"
    ? {
        rule: "cross-schema-enum",
        message: `${where} : enum ${target}.${field.type}, hors du schéma ${model.schema}`,
      }
    : {
        rule: "cross-schema-relation",
        message: `${where} : relation vers ${target}.${field.type}, hors du schéma ${model.schema}`,
      };

const fieldViolations = (
  model: SchemaModel,
  field: SchemaField,
  schemaOfType: ReadonlyMap<string, string>,
): readonly Violation[] => {
  const where = `${model.schema}.${model.name}.${field.name}`;
  const target = schemaOfType.get(field.type);
  if (target !== undefined && target !== model.schema) {
    return [crossSchemaViolation(where, model, field, target)];
  }
  const marks = annotations(field);
  if (marks.has(PERSONAL) && marks.has(NOT_PERSONAL)) {
    return [
      {
        rule: "personal-annotation",
        message: `${where} : ${PERSONAL} et ${NOT_PERSONAL} sont exclusifs`,
      },
    ];
  }
  if (looksPersonal(field.name) && !marks.has(PERSONAL) && !marks.has(NOT_PERSONAL)) {
    return [
      {
        rule: "personal-annotation",
        message: `${where} : ajouter /// ${PERSONAL} ou /// ${NOT_PERSONAL}`,
      },
    ];
  }
  return [];
};

const OUTBOX_SHAPE: readonly (readonly [string, string])[] = [
  ["id", "String"],
  ["name", "String"],
  ["version", "Int"],
  ["payload", "Json"],
  ["occurredAt", "DateTime"],
  ["publishedAt", "DateTime"],
  ["attempts", "Int"],
  ["nextAttemptAt", "DateTime"],
  ["lastError", "String"],
];

const PROCESSED_EVENT_SHAPE: readonly (readonly [string, string])[] = [
  ["eventId", "String"],
  ["handlerName", "String"],
  ["processedAt", "DateTime"],
];

const PROCESSED_EVENT_KEY = "eventId,handlerName";

const shapeViolation = (model: SchemaModel, detail: string): Violation => ({
  rule: "technical-shape",
  message: `${model.schema}.${model.name} : ${detail}`,
});

const missingFields = (
  model: SchemaModel,
  shape: readonly (readonly [string, string])[],
): readonly Violation[] =>
  shape
    .filter(
      ([name, type]) => !model.fields.some((field) => field.name === name && field.type === type),
    )
    .map(([name, type]) => shapeViolation(model, `champ attendu ${name} ${type}`));

const hasProcessedEventKey = (model: SchemaModel): boolean =>
  model.uniqueKeys.some((key) => key.toSorted().join(",") === PROCESSED_EVENT_KEY);

const shapeViolations = (model: SchemaModel): readonly Violation[] => {
  if (model.name.endsWith("Outbox")) {
    return missingFields(model, OUTBOX_SHAPE);
  }
  if (!model.name.endsWith("ProcessedEvent")) {
    return [];
  }
  return [
    ...missingFields(model, PROCESSED_EVENT_SHAPE),
    ...(hasProcessedEventKey(model)
      ? []
      : [shapeViolation(model, "unicité attendue sur (eventId, handlerName)")]),
  ];
};

export const lintSchema = (schema: PrismaSchema): readonly Violation[] => {
  const schemaOfType = new Map(
    [...schema.models, ...schema.enums].map((item) => [item.name, item.schema]),
  );
  return [
    ...schema.models.flatMap((model) => [
      ...prefixViolation(model),
      ...shapeViolations(model),
      ...model.fields.flatMap((field) => fieldViolations(model, field, schemaOfType)),
    ]),
    ...schema.enums.flatMap(prefixViolation),
  ];
};

export const personalInventory = (schema: PrismaSchema): readonly string[] =>
  schema.models
    .flatMap((model) =>
      model.fields
        .filter((field) => annotations(field).has(PERSONAL))
        .map((field) => `${model.schema}.${model.name}.${field.name}`),
    )
    .toSorted();
