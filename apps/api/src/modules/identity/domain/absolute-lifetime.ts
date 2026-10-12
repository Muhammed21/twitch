const ABSOLUTE_LIFETIME_MS = 180 * 86_400_000;

export const exceedsAbsoluteLifetime = ({
  authTime,
  now,
}: {
  authTime: Date | null;
  now: Date;
}): boolean => authTime === null || now.getTime() - authTime.getTime() > ABSOLUTE_LIFETIME_MS;
