import {
  type ChannelRole,
  isActive,
  isPlatformAssignment,
  type RoleAssignment,
} from "./ability.ts";

export type ChatSanction = { readonly channelId: string; readonly expiresAt: Date | null };

export type ChatterRole = {
  readonly channelId: string;
  readonly role: Exclude<ChannelRole, "banned">;
};

export type ChatterContext = {
  readonly userId: string;
  readonly roles: readonly ChatterRole[];
  readonly sanctions: readonly ChatSanction[];
};

const toChatterEntry = (
  assignment: RoleAssignment,
): { roles: readonly ChatterRole[]; sanctions: readonly ChatSanction[] } => {
  if (isPlatformAssignment(assignment)) {
    return { roles: [], sanctions: [] };
  }
  const { channelId } = assignment.scope;
  return assignment.role === "banned"
    ? { roles: [], sanctions: [{ channelId, expiresAt: assignment.expiresAt }] }
    : { roles: [{ channelId, role: assignment.role }], sanctions: [] };
};

export const chatterContextFor = ({
  userId,
  assignments,
  now,
}: {
  userId: string;
  assignments: readonly RoleAssignment[];
  now: Date;
}): ChatterContext => {
  const entries = assignments.filter((assignment) => isActive(assignment, now)).map(toChatterEntry);
  return {
    userId,
    roles: entries.flatMap((entry) => entry.roles),
    sanctions: entries.flatMap((entry) => entry.sanctions),
  };
};

const endOf = ({ expiresAt }: ChatSanction): number =>
  expiresAt === null ? Number.POSITIVE_INFINITY : expiresAt.getTime();

export const activeSanction = ({
  chatter,
  channelId,
  now,
}: {
  chatter: ChatterContext;
  channelId: string;
  now: Date;
}): ChatSanction | undefined => {
  const ends = chatter.sanctions
    .filter(
      (sanction) =>
        sanction.channelId === channelId &&
        isActive({ expiresAt: sanction.expiresAt, revokedAt: null }, now),
    )
    .map(endOf);
  if (ends.length === 0) {
    return undefined;
  }
  const end = Math.max(...ends);
  return { channelId, expiresAt: end === Number.POSITIVE_INFINITY ? null : new Date(end) };
};
