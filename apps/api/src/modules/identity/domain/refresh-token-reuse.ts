export type RefreshTokenState = {
  readonly revoked: Date | null;
  readonly rotationReplayExpiresAt: Date | null;
};

const withinReplayWindow = ({ rotationReplayExpiresAt }: RefreshTokenState, now: Date) =>
  rotationReplayExpiresAt !== null && rotationReplayExpiresAt.getTime() >= now.getTime();

export const isRefreshTokenReuse = ({
  token,
  now,
}: {
  token: RefreshTokenState;
  now: Date;
}): boolean => token.revoked !== null && !withinReplayWindow(token, now);
