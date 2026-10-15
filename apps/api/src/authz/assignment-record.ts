import { z } from "zod";

import { channelRoles, platformRoles, type RoleAssignment } from "@repo/authorization";

const Validity = { expiresAt: z.date().nullable(), revokedAt: z.date().nullable() };

const Row = z.union([
  z
    .object({
      role: z.enum(channelRoles),
      scopeType: z.literal("channel"),
      scopeId: z.string(),
      ...Validity,
    })
    .transform(({ role, scopeId, expiresAt, revokedAt }): RoleAssignment => ({
      role,
      scope: { type: "channel", channelId: scopeId },
      expiresAt,
      revokedAt,
    })),
  z
    .object({ role: z.enum(platformRoles), scopeType: z.literal("platform"), ...Validity })
    .transform(({ role, expiresAt, revokedAt }): RoleAssignment => ({
      role,
      scope: { type: "platform" },
      expiresAt,
      revokedAt,
    })),
]);

export const fromRows = (rows: readonly unknown[]): readonly RoleAssignment[] =>
  rows.flatMap((row) => {
    const parsed = Row.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });

const CachedDate = z.iso
  .datetime()
  .transform((value) => new Date(value))
  .nullable();

const CachedValidity = { expiresAt: CachedDate, revokedAt: CachedDate };

const Cached = z.array(
  z.union([
    z.object({
      role: z.enum(channelRoles),
      scope: z.object({ type: z.literal("channel"), channelId: z.string() }),
      ...CachedValidity,
    }),
    z.object({
      role: z.enum(platformRoles),
      scope: z.object({ type: z.literal("platform") }),
      ...CachedValidity,
    }),
  ]),
);

export const toCache = (assignments: readonly RoleAssignment[]): string =>
  JSON.stringify(assignments);

export const fromCache = (cached: string | null): readonly RoleAssignment[] | null => {
  try {
    const parsed = Cached.safeParse(JSON.parse(String(cached)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};
