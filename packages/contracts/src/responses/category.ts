import { z } from "zod";

import { openEnum, Uuid } from "../conventions/schemas.ts";

export const Category = z
  .looseObject({
    id: Uuid,
    slug: z.string(),
    name: z.string(),
    status: openEnum(["active", "merged", "retired"]),
    imageUrl: z.url().optional(),
  })
  .meta({ id: "Category" });

export const CategorySummary = z
  .looseObject({
    id: Uuid,
    slug: z.string(),
    name: z.string(),
    imageUrl: z.url().optional(),
  })
  .meta({ id: "CategorySummary" });

export const CategoryCatalog = z
  .looseObject({
    categories: z.array(CategorySummary),
  })
  .meta({ id: "CategoryCatalog" });
