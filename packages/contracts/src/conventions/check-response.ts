import { z } from "zod";

export type ConventionViolation = {
  readonly rule:
    | "closed-object"
    | "bare-enum"
    | "missing-fallback"
    | "root-nullable"
    | "nullish"
    | "unsupported";
  readonly path: string;
  readonly message: string;
};

const EXPLANATIONS: Record<ConventionViolation["rule"], string> = {
  "closed-object": "un objet de réponse s'écrit z.looseObject (ADR 0024 §2)",
  "bare-enum": "un enum de réponse passe par openEnum (ADR 0024 §3)",
  "missing-fallback":
    "une union de réponse se termine par une variante de repli, ou porte .meta({ closed: true }) (ADR 0024 §4)",
  "root-nullable": "pas de .nullable() directement sur un DTO, utiliser .optional() (ADR 0024 §5)",
  nullish: ".nullish() est interdit (ADR 0024 §5)",
  unsupported:
    "type de schéma que le garde ne sait pas vérifier, à lui apprendre avant de l'exporter",
};

const violation = (rule: ConventionViolation["rule"], path: string): ConventionViolation => ({
  rule,
  path,
  message: `${path} : ${EXPLANATIONS[rule]}`,
});

const isOpen = (schema: z.ZodObject): boolean => schema.def.catchall instanceof z.ZodUnknown;

const isOpenEnum = (schema: z.ZodUnion): boolean =>
  schema.options.length === 2 &&
  schema.options[0] instanceof z.ZodEnum &&
  schema.options[1] instanceof z.ZodString;

const isFallback = (schema: unknown): boolean => {
  if (!(schema instanceof z.ZodObject) || !isOpen(schema)) {
    return false;
  }
  const fields = Object.values(schema.shape);
  return fields.length === 1 && fields[0] instanceof z.ZodString;
};

const isClosedByChoice = (schema: z.ZodUnion): boolean =>
  z.globalRegistry.get(schema)?.["closed"] === true;

type Position = "dto" | "property";

const LEAVES = new Set(["string", "number", "boolean", "literal", "null", "unknown"]);

const walk = (
  schema: unknown,
  path: string,
  seen: ReadonlySet<unknown>,
  position?: Position,
): readonly ConventionViolation[] => {
  if (schema instanceof z.ZodOptional) {
    const inner: unknown = schema.unwrap();
    return inner instanceof z.ZodNullable
      ? [violation("nullish", path), ...walk(inner.unwrap(), path, seen)]
      : walk(inner, path, seen, position);
  }
  if (schema instanceof z.ZodNullable) {
    const inner: unknown = schema.unwrap();
    if (inner instanceof z.ZodOptional) {
      return [violation("nullish", path), ...walk(inner.unwrap(), path, seen)];
    }
    return [
      ...(position === "property" ? [violation("root-nullable", path)] : []),
      ...walk(inner, path, seen),
    ];
  }
  if (
    schema instanceof z.ZodReadonly ||
    schema instanceof z.ZodDefault ||
    schema instanceof z.ZodCatch
  ) {
    return walk(schema.def.innerType, path, seen, position);
  }
  if (schema instanceof z.ZodLazy) {
    return seen.has(schema)
      ? []
      : walk(schema.def.getter(), path, new Set([...seen, schema]), position);
  }
  if (schema instanceof z.ZodPipe) {
    return [
      ...walk(schema.def.in, path, seen, position),
      ...walk(schema.def.out, path, seen, position),
    ];
  }
  if (schema instanceof z.ZodIntersection) {
    return [
      ...walk(schema.def.left, `${path}&0`, seen, position),
      ...walk(schema.def.right, `${path}&1`, seen, position),
    ];
  }
  if (schema instanceof z.ZodObject) {
    if (seen.has(schema)) {
      return [];
    }
    const inside = new Set([...seen, schema]);
    return [
      ...(isOpen(schema) ? [] : [violation("closed-object", path)]),
      ...Object.entries(schema.shape).flatMap(([key, field]) =>
        position === "dto"
          ? walk(field, `${path}.${key}`, inside, "property")
          : walk(field, `${path}.${key}`, inside),
      ),
    ];
  }
  if (schema instanceof z.ZodArray) {
    return walk(schema.element, `${path}[]`, seen);
  }
  if (schema instanceof z.ZodRecord) {
    return [
      ...walk(schema.def.keyType, `${path}{key}`, seen),
      ...walk(schema.def.valueType, `${path}{}`, seen),
    ];
  }
  if (schema instanceof z.ZodTuple) {
    return [
      ...schema.def.items.flatMap((item, index) => walk(item, `${path}[${index}]`, seen)),
      ...(schema.def.rest === null ? [] : walk(schema.def.rest, `${path}[...]`, seen)),
    ];
  }
  if (schema instanceof z.ZodEnum) {
    return [violation("bare-enum", path)];
  }
  if (schema instanceof z.ZodUnion) {
    if (isOpenEnum(schema)) {
      return [];
    }
    const options: readonly unknown[] = schema.options;
    return [
      ...(isClosedByChoice(schema) || isFallback(options.at(-1))
        ? []
        : [violation("missing-fallback", path)]),
      ...options.flatMap((option, index) => walk(option, `${path}<${index}>`, seen)),
    ];
  }
  return schema instanceof z.ZodType && LEAVES.has(schema.def.type)
    ? []
    : [violation("unsupported", path)];
};

export const checkResponseSchema = (
  name: string,
  schema: z.ZodType,
): readonly ConventionViolation[] => walk(schema, name, new Set(), "dto");
