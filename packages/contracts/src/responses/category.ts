import { z } from "zod";

import { openEnum, Uuid } from "../conventions/schemas.ts";

export const Category = z
  .looseObject({
    id: Uuid,
    slug: z.string(),
    name: z.string(),
    status: openEnum(["active", "merged", "retired"]),
  })
  .meta({ id: "Category" });
