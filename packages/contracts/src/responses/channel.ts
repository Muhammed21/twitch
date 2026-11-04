import { z } from "zod";

import { Uuid } from "../conventions/schemas.ts";
import { CategorySummary } from "./category.ts";

export const Channel = z
  .looseObject({
    id: Uuid,
    slug: z.string(),
    title: z.string(),
    ownerId: Uuid,
    category: CategorySummary.optional(),
  })
  .meta({ id: "Channel" });
