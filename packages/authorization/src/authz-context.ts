import { type AppAbility, defineAbilityFor, type RoleAssignment } from "./ability.ts";

export interface AuthzContext {
  assignmentsOf(userId: string): Promise<readonly RoleAssignment[]>;
  abilityFor(userId: string): Promise<AppAbility>;
}

export const authzContextFrom = ({
  assignmentsOf,
  now,
}: {
  assignmentsOf: (userId: string) => Promise<readonly RoleAssignment[]>;
  now: () => Date;
}): AuthzContext => ({
  assignmentsOf,
  abilityFor: async (userId) =>
    defineAbilityFor({ assignments: await assignmentsOf(userId), now: now() }),
});

export const inMemoryAuthzContext = ({
  assignments,
  now,
}: {
  assignments: Readonly<Record<string, readonly RoleAssignment[]>>;
  now: () => Date;
}): AuthzContext =>
  authzContextFrom({ assignmentsOf: async (userId) => assignments[userId] ?? [], now });
