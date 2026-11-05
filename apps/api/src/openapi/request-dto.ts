import { createZodDto } from "nestjs-zod";
import type { z } from "zod";

const METADATA_FACTORY = "_OPENAPI_METADATA_FACTORY";

type JsonObject = { readonly [key: string]: unknown };

const isRecord = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null;

const typeListAsUnion = (property: unknown): unknown =>
  isRecord(property) && Array.isArray(property["type"])
    ? { ...property, type: "", anyOf: property["type"].map((type: unknown) => ({ type })) }
    : property;

export const requestDto = <Schema extends z.ZodType>(schema: Schema) => {
  const dto = createZodDto(schema);
  const generated = dto[METADATA_FACTORY].bind(dto);
  return Object.defineProperty(dto, METADATA_FACTORY, {
    value: () =>
      Object.fromEntries(
        Object.entries(Object(generated())).map(([name, property]) => [
          name,
          typeListAsUnion(property),
        ]),
      ),
  });
};
