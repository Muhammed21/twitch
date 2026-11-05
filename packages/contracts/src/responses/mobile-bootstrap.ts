import { z } from "zod";

import { openEnum, Uuid } from "../conventions/schemas.ts";

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
    bio: z.string().optional(),
    lastLiveAt: z.iso.datetime().optional(),
    avatarUrl: z.url({ protocol: /^https?$/ }).optional(),
    bannerUrl: z.url({ protocol: /^https?$/ }).optional(),
    channel: OwnedChannel.optional(),
  })
  .meta({ id: "Profile" });

export const Entitlement = z
  .looseObject({
    scope: openEnum(["platform"]).pipe(z.string().min(1)),
    expiresAt: z.iso.datetime(),
  })
  .meta({ id: "Entitlement" });

export const EntitlementList = z
  .looseObject({ entitlements: z.array(Entitlement) })
  .meta({ id: "EntitlementList" });

export const MobileBootstrap = z
  .looseObject({
    minSupportedVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    flags: z.looseObject({ session_replay: z.boolean() }),
    profile: Profile.optional(),
    entitlements: z.array(Entitlement),
  })
  .meta({ id: "MobileBootstrap" });
