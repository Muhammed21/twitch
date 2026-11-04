import { z } from "zod";

import { Uuid } from "../conventions/schemas.ts";

export const OwnedChannel = z
  .looseObject({
    id: Uuid,
    slug: z.string(),
  })
  .meta({ id: "OwnedChannel" });

export const Me = z
  .looseObject({
    id: Uuid,
    name: z.string(),
    email: z.string(),
    channel: OwnedChannel.optional(),
  })
  .meta({ id: "Me" });
