import { z } from "zod";

export const openEnum = <const Values extends readonly [string, ...string[]]>(values: Values) =>
  z.union([z.enum(values), z.string()]);

export const Uuid = z.uuid().meta({ id: "Uuid" });

export const extensibleUnion = <const Variants extends readonly [z.ZodObject, ...z.ZodObject[]]>(
  discriminant: string,
  variants: Variants,
) => z.union([...variants, z.looseObject({ [discriminant]: z.string() })]);
