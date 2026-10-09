import { err, ok, type Result } from "@repo/result";

export type AccountId = string & { readonly __brand: "AccountId" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const isAccountId = (value: string): value is AccountId => UUID.test(value);

export const parseAccountId = (raw: string): Result<AccountId, "invalid_account_id"> => {
  const normalized = raw.toLowerCase();
  return isAccountId(normalized) ? ok(normalized) : err("invalid_account_id");
};
