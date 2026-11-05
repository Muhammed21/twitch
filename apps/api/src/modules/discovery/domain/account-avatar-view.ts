export type AccountAvatarView = {
  readonly accountId: string;
  readonly avatarKey: string;
  readonly changedAt: Date;
};

export type AccountAvatarEvent = {
  readonly kind: "avatar-changed";
  readonly accountId: string;
  readonly avatarKey: string;
  readonly changedAt: Date;
};

export const applyAccountAvatarEvent = (
  current: AccountAvatarView | null,
  { accountId, avatarKey, changedAt }: AccountAvatarEvent,
): AccountAvatarView =>
  current !== null && current.changedAt.getTime() >= changedAt.getTime()
    ? current
    : { accountId, avatarKey, changedAt };
