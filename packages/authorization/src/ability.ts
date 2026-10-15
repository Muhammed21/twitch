import {
  AbilityBuilder,
  createMongoAbility,
  type ForcedSubject,
  type MongoAbility,
  subject,
} from "@casl/ability";

export const channelRoles = ["owner", "editor", "moderator", "vip", "banned"] as const;

export type ChannelRole = (typeof channelRoles)[number];

export const platformRoles = ["admin", "staff", "support"] as const;

export type PlatformRole = (typeof platformRoles)[number];

type Validity = { readonly expiresAt: Date | null; readonly revokedAt: Date | null };

type ChannelAssignment = Validity & {
  readonly role: ChannelRole;
  readonly scope: { readonly type: "channel"; readonly channelId: string };
};

type PlatformAssignment = Validity & {
  readonly role: PlatformRole;
  readonly scope: { readonly type: "platform" };
};

export type RoleAssignment = ChannelAssignment | PlatformAssignment;

const isPlatformAssignment = (assignment: RoleAssignment): assignment is PlatformAssignment =>
  assignment.scope.type === "platform";

type Channel = ForcedSubject<"Channel"> & { readonly id: string };
type ChannelRoleGrant = ForcedSubject<"ChannelRole"> & {
  readonly channelId: string;
  readonly role: ChannelRole;
};
type ChannelMember = ForcedSubject<"ChannelMember"> & {
  readonly channelId: string;
  readonly targetIsOwner: boolean;
  readonly targetIsModerator: boolean;
  readonly targetIsEditor: boolean;
};
type Chat = ForcedSubject<"Chat"> & { readonly channelId: string };

type Abilities =
  | ["update" | "readStreamKey" | "suspend", "Channel" | Channel]
  | ["grant", "ChannelRole" | ChannelRoleGrant]
  | ["timeout" | "ban", "ChannelMember" | ChannelMember]
  | ["send", "Chat" | Chat];

export type AppAbility = MongoAbility<Abilities>;

const isActive = ({ expiresAt, revokedAt }: Validity, now: Date) =>
  revokedAt === null && (expiresAt === null || expiresAt.getTime() > now.getTime());

const UNPROTECTED_FOR_OWNER = { targetIsOwner: false } as const;

const UNPROTECTED_FOR_MODERATOR = {
  targetIsOwner: false,
  targetIsModerator: false,
  targetIsEditor: false,
} as const;

type Builder = AbilityBuilder<AppAbility>;

const CHANNEL_RULES: Readonly<Record<ChannelRole, (builder: Builder, channelId: string) => void>> =
  {
    owner: ({ can }, channelId) => {
      can(["update", "readStreamKey"], "Channel", { id: channelId });
      can("grant", "ChannelRole", { channelId, role: { $in: ["editor", "vip", "moderator"] } });
      can(["timeout", "ban"], "ChannelMember", { channelId, ...UNPROTECTED_FOR_OWNER });
    },
    editor: ({ can }, channelId) => {
      can("update", "Channel", { id: channelId });
      can("grant", "ChannelRole", { channelId, role: "vip" });
    },
    moderator: ({ can }, channelId) => {
      can(["timeout", "ban"], "ChannelMember", { channelId, ...UNPROTECTED_FOR_MODERATOR });
    },
    vip: () => {},
    banned: () => {},
  };

const PLATFORM_RULES: Readonly<Record<PlatformRole, (builder: Builder) => void>> = {
  admin: ({ can }) => {
    can("suspend", "Channel");
  },
  staff: ({ can }) => {
    can("suspend", "Channel");
  },
  support: () => {},
};

const isBan = (assignment: RoleAssignment): assignment is ChannelAssignment =>
  assignment.role === "banned";

const applyBan = ({ cannot }: Builder, channelId: string) => {
  cannot(["update", "readStreamKey"], "Channel", { id: channelId });
  cannot("grant", "ChannelRole", { channelId });
  cannot(["timeout", "ban"], "ChannelMember", { channelId });
  cannot("send", "Chat", { channelId });
};

export const defineAbilityFor = ({
  assignments,
  now,
}: {
  assignments: readonly RoleAssignment[];
  now: Date;
}): AppAbility => {
  const builder = new AbilityBuilder<AppAbility>(createMongoAbility);
  builder.can("send", "Chat");
  const active = assignments.filter((assignment) => isActive(assignment, now));
  active.forEach((assignment) =>
    isPlatformAssignment(assignment)
      ? PLATFORM_RULES[assignment.role](builder)
      : CHANNEL_RULES[assignment.role](builder, assignment.scope.channelId),
  );
  active.filter(isBan).forEach(({ scope }) => applyBan(builder, scope.channelId));
  return builder.build();
};

export const channel = (id: string): Channel => subject("Channel", { id });

export const channelRole = (channelId: string, role: ChannelRole): ChannelRoleGrant =>
  subject("ChannelRole", { channelId, role });

export const chat = (channelId: string): Chat => subject("Chat", { channelId });

export const channelMember = ({
  channelId,
  targetAssignments,
  now,
}: {
  channelId: string;
  targetAssignments: readonly RoleAssignment[];
  now: Date;
}): ChannelMember => {
  const holds = (role: ChannelRole) =>
    targetAssignments.some(
      (assignment) =>
        assignment.role === role &&
        assignment.scope.type === "channel" &&
        assignment.scope.channelId === channelId &&
        isActive(assignment, now),
    );
  return subject("ChannelMember", {
    channelId,
    targetIsOwner: holds("owner"),
    targetIsModerator: holds("moderator"),
    targetIsEditor: holds("editor"),
  });
};
