import { ok, type Result } from "@repo/result";

import type { Account } from "./get-current-account.ts";

export type OwnedChannel = {
  readonly id: string;
  readonly slug: string;
};

export type FindOwnedChannel = (ownerId: string) => Promise<OwnedChannel | null>;

export type MeView = Account & { readonly channel?: OwnedChannel };

export type ReadMe = (userId: string) => Promise<Result<MeView, "account_not_found">>;

export const readMe =
  ({
    currentAccount,
    ownedChannel,
  }: {
    currentAccount: (userId: string) => Promise<Result<Account, "account_not_found">>;
    ownedChannel: FindOwnedChannel;
  }): ReadMe =>
  async (userId) => {
    const account = await currentAccount(userId);
    if (!account.ok) {
      return account;
    }
    const channel = await ownedChannel(userId);
    return ok(channel === null ? account.value : { ...account.value, channel });
  };
