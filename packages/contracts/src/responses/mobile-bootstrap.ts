import { z } from "zod";

import { Uuid } from "../conventions/schemas.ts";

export const Profile = z
  .looseObject({
    id: Uuid,
    name: z.string(),
    email: z.string(),
  })
  .meta({ id: "Profile" });

export const MobileBootstrap = z
  .looseObject({
    minSupportedVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    flags: z.looseObject({ session_replay: z.boolean() }),
    profile: Profile.optional(),
  })
  .meta({ id: "MobileBootstrap" });
