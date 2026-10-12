export type AuthenticationMethod = "pwd" | "otp" | "mfa";

const PASSWORD: readonly AuthenticationMethod[] = ["pwd"];

const SECOND_FACTOR: readonly AuthenticationMethod[] = ["pwd", "otp", "mfa"];

const METHODS_BY_ENDPOINT: ReadonlyMap<string, readonly AuthenticationMethod[]> = new Map([
  ["/sign-up/email", PASSWORD],
  ["/sign-in/email", PASSWORD],
  ["/two-factor/verify-totp", SECOND_FACTOR],
  ["/two-factor/verify-backup-code", SECOND_FACTOR],
]);

export const authenticationMethodsFor = (path: string): readonly AuthenticationMethod[] =>
  METHODS_BY_ENDPOINT.get(path) ?? [];

export const authenticationClaims = ({
  createdAt,
  amr,
}: {
  createdAt: Date;
  amr: readonly string[] | null;
}): { twitch_auth_time: number; twitch_amr: readonly string[] } => ({
  twitch_auth_time: Math.floor(createdAt.getTime() / 1000),
  twitch_amr: amr ?? [],
});
