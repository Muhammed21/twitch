import { err, ok, type Result } from "@repo/result";

export type Account = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly bio?: string;
  readonly lastLiveAt?: Date;
};

export type ReadProfile = (userId: string) => Promise<Result<Account, "account_not_found">>;

export type OwnedChannel = {
  readonly id: string;
  readonly slug: string;
};

export type FindOwnedChannel = (ownerId: string) => Promise<OwnedChannel | null>;

export type Profile = Account & { readonly channel?: OwnedChannel };

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
    ownedChannel,
    minSupportedVersion,
    onEvaluationFailure,
  }: {
    featureFlags: FeatureFlags;
    readProfile: ReadProfile;
    ownedChannel: FindOwnedChannel;
    minSupportedVersion: string;
    onEvaluationFailure: (error: unknown) => void;
  }) =>
  async (userId: string | undefined): Promise<Result<Bootstrap, "account_not_found">> => {
    if (userId === undefined) {
      return ok({ minSupportedVersion, flags: SAFE_FLAGS });
    }
    const [profile, channel, evaluated] = await Promise.all([
      readProfile(userId),
      ownedChannel(userId),
      featureFlags.evaluate(userId).catch((error: unknown) => {
        onEvaluationFailure(error);
        return NO_EVALUATION;
      }),
    ]);
    if (!profile.ok) {
      return err(profile.error);
    }
    return ok({
      minSupportedVersion,
      flags: resolveFlags(evaluated),
      profile: channel === null ? profile.value : { ...profile.value, channel },
    });
  };
