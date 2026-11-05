import {
  applyTurboEvent,
  type EntitlementChange,
  type TurboDecision,
  type TurboEntitlement,
  type TurboEvent,
  transferTurbo,
} from "../domain/turbo-entitlement.ts";

export type TurboCommand =
  | { readonly kind: "apply"; readonly event: TurboEvent }
  | {
      readonly kind: "transfer";
      readonly fromUserIds: readonly string[];
      readonly toUserId: string;
      readonly occurredAt: Date;
    };

export type TurboLedgerTransaction = {
  lock: (userIds: readonly string[]) => Promise<void>;
  current: (userId: string) => Promise<TurboEntitlement | undefined>;
  save: (entitlements: readonly TurboEntitlement[]) => Promise<void>;
  publish: (changes: readonly EntitlementChange[], occurredAt: Date) => Promise<void>;
};

const occurredAtOf = (command: TurboCommand): Date =>
  command.kind === "apply" ? command.event.occurredAt : command.occurredAt;

const decide = async (
  ledger: TurboLedgerTransaction,
  command: TurboCommand,
  newId: () => string,
): Promise<TurboDecision> => {
  if (command.kind === "apply") {
    const { event } = command;
    await ledger.lock([event.userId]);
    return applyTurboEvent({ current: await ledger.current(event.userId), event, newId });
  }
  const { fromUserIds, toUserId, occurredAt } = command;
  await ledger.lock([...fromUserIds, toUserId]);
  const origins = await Promise.all(fromUserIds.map((userId) => ledger.current(userId)));
  return transferTurbo({
    origins,
    target: await ledger.current(toUserId),
    toUserId,
    occurredAt,
    newId,
  });
};

export const applyTurboCommand = async ({
  ledger,
  command,
  newId,
}: {
  ledger: TurboLedgerTransaction;
  command: TurboCommand;
  newId: () => string;
}): Promise<TurboDecision> => {
  const decision = await decide(ledger, command, newId);
  await ledger.save(decision.saved);
  await ledger.publish(decision.changes, occurredAtOf(command));
  return decision;
};
