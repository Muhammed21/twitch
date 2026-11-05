import { err, ok, type Result } from "@repo/result";

export type StoredAccount = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly bio?: string;
  readonly avatarKey?: string;
};

export type Account = Omit<StoredAccount, "avatarKey"> & {
  readonly lastLiveAt?: Date;
  readonly avatarUrl?: string;
};

export interface AccountDirectory {
  findById(id: string): Promise<StoredAccount | null>;
}

export type LastLiveOf = (userId: string) => Promise<Date | undefined>;

export const getCurrentAccount =
  ({
    directory,
    lastLiveOf,
    imageUrlOf,
  }: {
    directory: AccountDirectory;
    lastLiveOf: LastLiveOf;
    imageUrlOf: (key: string) => string;
  }) =>
  async (userId: string): Promise<Result<Account, "account_not_found">> => {
    const [account, lastLiveAt] = await Promise.all([
      directory.findById(userId),
      lastLiveOf(userId),
    ]);
    if (account === null) {
      return err("account_not_found");
    }
    const { avatarKey, ...stored } = account;
    return ok({
      ...stored,
      ...(lastLiveAt === undefined ? {} : { lastLiveAt }),
      ...(avatarKey === undefined ? {} : { avatarUrl: imageUrlOf(avatarKey) }),
    });
  };
