import { err, ok, type Result } from "@repo/result";

export type Profile = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
};

export type ReadProfile = (userId: string) => Promise<Result<Profile, "account_not_found">>;

export interface FeatureFlags {
  evaluate(distinctId: string): Promise<Readonly<Record<string, unknown>>>;
}

export type Flags = {
  readonly session_replay: boolean;
};

const SAFE_FLAGS: Flags = { session_replay: false };

export type Bootstrap = {
  readonly minSupportedVersion: string;
  readonly flags: Flags;
  readonly profile?: Profile;
};

const booleanOr = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

const resolveFlags = (evaluated: Readonly<Record<string, unknown>>): Flags => ({
  session_replay: booleanOr(evaluated["session_replay"], SAFE_FLAGS.session_replay),
});

const NO_EVALUATION: Readonly<Record<string, unknown>> = {};

export const readBootstrap =
  ({
    featureFlags,
    readProfile,
    minSupportedVersion,
  }: {
    featureFlags: FeatureFlags;
    readProfile: ReadProfile;
    minSupportedVersion: string;
  }) =>
  async (userId: string | undefined): Promise<Result<Bootstrap, "account_not_found">> => {
    if (userId === undefined) {
      return ok({ minSupportedVersion, flags: SAFE_FLAGS });
    }
    const [profile, evaluated] = await Promise.all([
      readProfile(userId),
      featureFlags.evaluate(userId).catch(() => NO_EVALUATION),
    ]);
    if (!profile.ok) {
      return err(profile.error);
    }
    return ok({ minSupportedVersion, flags: resolveFlags(evaluated), profile: profile.value });
  };
