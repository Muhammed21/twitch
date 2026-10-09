import { z } from "zod";

export const Problem = z
  .looseObject({
    type: z.string(),
    title: z.string(),
    status: z.int().min(100).max(599),
    detail: z.string().optional(),
    instance: z.string().optional(),
    correlationId: z.string().optional(),
    errors: z.array(z.looseObject({ path: z.string(), message: z.string() })).optional(),
  })
  .meta({ id: "Problem" });
