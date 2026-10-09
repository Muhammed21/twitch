type JsonObject = { readonly [key: string]: unknown };

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isBareNull = (branch: unknown): boolean =>
  isObject(branch) && Object.keys(branch).length === 1 && branch["type"] === "null";

const singleType = (branch: unknown): branch is JsonObject & { type: string } =>
  isObject(branch) && typeof branch["type"] === "string" && branch["type"] !== "null";

const collapse = (schema: JsonObject): JsonObject => {
  const branches = schema["anyOf"];
  if (!Array.isArray(branches)) {
    return schema;
  }
  const others: readonly unknown[] = branches.filter((branch) => !isBareNull(branch));
  const [other] = others;
  if (branches.length !== 2 || others.length !== 1 || !singleType(other)) {
    return schema;
  }
  const siblings = Object.fromEntries(Object.entries(schema).filter(([key]) => key !== "anyOf"));
  return { ...siblings, ...other, type: [other.type, "null"] };
};

export const normalizeNullable = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(normalizeNullable);
  }
  if (!isObject(value)) {
    return value;
  }
  return collapse(
    Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, normalizeNullable(child)]),
    ),
  );
};
