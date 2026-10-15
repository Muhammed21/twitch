import { z } from "zod";

import { Uuid } from "../conventions/schemas.ts";

export const Channel = z
  .looseObject({
    id: Uuid,
    slug: z.string(),
    title: z.string(),
    ownerId: Uuid,
  })
  .meta({ id: "Channel" });
