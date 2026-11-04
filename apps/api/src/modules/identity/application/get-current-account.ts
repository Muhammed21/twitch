import { err, ok, type Result } from "@repo/result";

export type StoredAccount = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly bio?: string;
};

export type Account = StoredAccount & { readonly lastLiveAt?: Date };

export interface AccountDirectory {
  findById(id: string): Promise<StoredAccount | null>;
}

export type LastLiveOf = (userId: string) => Promise<Date | undefined>;

export const getCurrentAccount =
  ({ directory, lastLiveOf }: { directory: AccountDirectory; lastLiveOf: LastLiveOf }) =>
  async (userId: string): Promise<Result<Account, "account_not_found">> => {
    const [account, lastLiveAt] = await Promise.all([
      directory.findById(userId),
      lastLiveOf(userId),
    ]);
    if (account === null) {
      return err("account_not_found");
    }
    return ok(lastLiveAt === undefined ? account : { ...account, lastLiveAt });
  };
