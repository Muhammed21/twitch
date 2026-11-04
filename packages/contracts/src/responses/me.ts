import { z } from "zod";

import { Uuid } from "../conventions/schemas.ts";

export const Me = z
  .looseObject({
    id: Uuid,
    name: z.string(),
    email: z.string(),
  })
  .meta({ id: "Me" });
