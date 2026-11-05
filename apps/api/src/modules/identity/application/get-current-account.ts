import { err, ok, type Result } from "@repo/result";

export type StoredAccount = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly bio?: string;
  readonly avatarKey?: string;
  readonly chatColor?: string;
};

export type Account = Omit<StoredAccount, "avatarKey"> & {
  readonly lastLiveAt?: Date;
  readonly avatarUrl?: string;
  readonly bannerUrl?: string;
};

export interface AccountDirectory {
  findById(id: string): Promise<StoredAccount | null>;
}

export type LastLiveOf = (userId: string) => Promise<Date | undefined>;

export type BannerUrlOf = (userId: string) => Promise<string | undefined>;

export const getCurrentAccount =
  ({
    directory,
    lastLiveOf,
    imageUrlOf,
    bannerUrlOf,
  }: {
    directory: AccountDirectory;
    lastLiveOf: LastLiveOf;
    imageUrlOf: (key: string) => string;
    bannerUrlOf: BannerUrlOf;
  }) =>
  async (userId: string): Promise<Result<Account, "account_not_found">> => {
    const [account, lastLiveAt, bannerUrl] = await Promise.all([
      directory.findById(userId),
      lastLiveOf(userId),
      bannerUrlOf(userId),
    ]);
    if (account === null) {
      return err("account_not_found");
    }
    const { avatarKey, ...stored } = account;
    return ok({
      ...stored,
      ...(lastLiveAt === undefined ? {} : { lastLiveAt }),
      ...(avatarKey === undefined ? {} : { avatarUrl: imageUrlOf(avatarKey) }),
      ...(bannerUrl === undefined ? {} : { bannerUrl }),
    });
  };
