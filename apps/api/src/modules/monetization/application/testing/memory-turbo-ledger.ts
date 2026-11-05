import type { EntitlementChange, TurboEntitlement } from "../../domain/turbo-entitlement.ts";
import type { TurboLedgerTransaction } from "../apply-turbo-command.ts";

export type PublishedChange = EntitlementChange & { readonly occurredAt: Date };

export const memoryTurboLedger = (initial: readonly TurboEntitlement[] = []) => {
  const rows = new Map(initial.map((entitlement) => [entitlement.id, entitlement]));
  const published: PublishedChange[] = [];
  const locks: (readonly string[])[] = [];
  const ledger: TurboLedgerTransaction = {
    lock: async (userIds) => {
      locks.push(userIds);
    },
    current: async (userId) =>
      [...rows.values()]
        .filter((entitlement) => entitlement.userId === userId)
        .toSorted((left, right) => right.lastEventAt.getTime() - left.lastEventAt.getTime())[0],
    save: async (entitlements) => {
      entitlements.forEach((entitlement) => rows.set(entitlement.id, entitlement));
    },
    publish: async (changes, occurredAt) => {
      published.push(...changes.map((change) => ({ ...change, occurredAt })));
    },
  };
  return { ledger, rows: () => [...rows.values()], published, locks };
};
