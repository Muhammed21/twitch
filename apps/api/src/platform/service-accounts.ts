import { createHash, timingSafeEqual } from "node:crypto";

export type ServiceAccount = {
  readonly id: string;
  readonly scopes: readonly string[];
  readonly secret: string;
};

export const PAYLOAD_ADMIN_ACCOUNT = {
  id: "svc:payload-admin",
  scopes: ["admin:category.manage"],
} as const satisfies Omit<ServiceAccount, "secret">;

const digest = (value: string) => createHash("sha256").update(value).digest();

export const authenticateService = ({
  accounts,
  secret,
}: {
  accounts: readonly ServiceAccount[];
  secret: string;
}): ServiceAccount | undefined => {
  const presented = digest(secret);
  return accounts.find((account) => timingSafeEqual(digest(account.secret), presented));
};
