import { err, ok, type Result } from "@repo/result";

export type Account = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly bio?: string;
  readonly lastLiveAt?: Date;
  readonly avatarUrl?: string;
  readonly bannerUrl?: string;
};

export type ReadProfile = (userId: string) => Promise<Result<Account, "account_not_found">>;

export type OwnedChannel = {
  readonly id: string;
  readonly slug: string;
};

export type FindOwnedChannel = (ownerId: string) => Promise<OwnedChannel | null>;

export type Entitlement = {
  readonly scope: "platform";
  readonly expiresAt: Date;
};

export type ReadEntitlements = (userId: string) => Promise<readonly Entitlement[]>;

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
  readonly entitlements: readonly Entitlement[];
};

const booleanOr = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

const resolveFlags = (evaluated: Readonly<Record<string, unknown>>): Flags => ({
  session_replay: booleanOr(evaluated["session_replay"], SAFE_FLAGS.session_replay),
});

const NO_EVALUATION: Readonly<Record<string, unknown>> = {};

const NO_ENTITLEMENTS: readonly Entitlement[] = [];

export const readBootstrap =
  ({
    featureFlags,
    readProfile,
    ownedChannel,
    readEntitlements,
    minSupportedVersion,
    onEvaluationFailure,
    onEntitlementsFailure,
  }: {
    featureFlags: FeatureFlags;
    readProfile: ReadProfile;
    ownedChannel: FindOwnedChannel;
    readEntitlements: ReadEntitlements;
    minSupportedVersion: string;
    onEvaluationFailure: (error: unknown) => void;
    onEntitlementsFailure: (error: unknown) => void;
  }) =>
  async (userId: string | undefined): Promise<Result<Bootstrap, "account_not_found">> => {
    if (userId === undefined) {
      return ok({ minSupportedVersion, flags: SAFE_FLAGS, entitlements: NO_ENTITLEMENTS });
    }
    const [profile, channel, evaluated, entitlements] = await Promise.all([
      readProfile(userId),
      ownedChannel(userId),
      featureFlags.evaluate(userId).catch((error: unknown) => {
        onEvaluationFailure(error);
        return NO_EVALUATION;
      }),
      readEntitlements(userId).catch((error: unknown) => {
        onEntitlementsFailure(error);
        return NO_ENTITLEMENTS;
      }),
    ]);
    if (!profile.ok) {
      return err(profile.error);
    }
    return ok({
      minSupportedVersion,
      flags: resolveFlags(evaluated),
      profile: channel === null ? profile.value : { ...profile.value, channel },
      entitlements,
    });
  };
