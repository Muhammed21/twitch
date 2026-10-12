import { err, ok, type Result } from "@repo/result";

export type Account = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
};

export interface AccountDirectory {
  findById(id: string): Promise<Account | null>;
}

export const getCurrentAccount =
  (directory: AccountDirectory) =>
  async (userId: string): Promise<Result<Account, "account_not_found">> => {
    const account = await directory.findById(userId);
    return account === null ? err("account_not_found") : ok(account);
  };
