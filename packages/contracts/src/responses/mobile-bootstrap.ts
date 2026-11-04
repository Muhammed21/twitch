import { z } from "zod";

import { Uuid } from "../conventions/schemas.ts";

export const OwnedChannel = z
  .looseObject({
    id: Uuid,
    slug: z.string(),
  })
  .meta({ id: "OwnedChannel" });

export const Profile = z
  .looseObject({
    id: Uuid,
    name: z.string(),
    email: z.string(),
    channel: OwnedChannel.optional(),
  })
  .meta({ id: "Profile" });

export const MobileBootstrap = z
  .looseObject({
    minSupportedVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    flags: z.looseObject({ session_replay: z.boolean() }),
    profile: Profile.optional(),
  })
  .meta({ id: "MobileBootstrap" });
