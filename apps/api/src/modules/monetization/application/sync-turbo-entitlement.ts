import { err, ok, type Result } from "@repo/result";

import type { TurboDecision, TurboEvent } from "../domain/turbo-entitlement.ts";
import { applyTurboCommand, type TurboLedgerTransaction } from "./apply-turbo-command.ts";

export type ActiveEntitlement = {
  readonly scope: "platform";
  readonly expiresAt: Date;
};

export type ReadActiveEntitlements = (userId: string) => Promise<readonly ActiveEntitlement[]>;

export type ObservedTurbo = Extract<TurboEvent, { kind: "observed" }>;

export type ObserveTurbo = (userId: string) => Promise<Result<ObservedTurbo, "unavailable">>;

export type TurboTransaction = <T>(
  work: (ledger: TurboLedgerTransaction) => Promise<T>,
) => Promise<T>;

export type SyncTurboEntitlement = (
  userId: string,
) => Promise<Result<TurboDecision["outcome"], "unavailable">>;

export const syncTurboEntitlement =
  ({
    observe,
    transact,
    newId,
  }: {
    observe: ObserveTurbo;
    transact: TurboTransaction;
    newId: () => string;
  }): SyncTurboEntitlement =>
  async (userId) => {
    const observed = await observe(userId);
    if (!observed.ok) {
      return err("unavailable");
    }
    const decision = await transact((ledger) =>
      applyTurboCommand({ ledger, command: { kind: "apply", event: observed.value }, newId }),
    );
    return ok(decision.outcome);
  };
