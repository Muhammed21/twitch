import type { Result } from "@repo/result";

import {
  applyTurboCommand,
  type TurboCommand,
  type TurboLedgerTransaction,
} from "./apply-turbo-command.ts";

export type PendingWebhook = { readonly eventId: string; readonly payload: unknown };

export type WebhookSkip = { readonly eventId: string; readonly reason: string };

export type ProcessWebhook = (
  webhook: PendingWebhook,
  ledger: TurboLedgerTransaction,
) => Promise<string>;

export const processWebhook =
  ({
    translate,
    newId,
    alert,
  }: {
    translate: (payload: unknown) => Result<TurboCommand, string>;
    newId: () => string;
    alert: (skip: WebhookSkip) => void;
  }): ProcessWebhook =>
  async ({ eventId, payload }, ledger) => {
    const command = translate(payload);
    if (!command.ok) {
      alert({ eventId, reason: command.error });
      return command.error;
    }
    const decision = await applyTurboCommand({ ledger, command: command.value, newId });
    return decision.outcome;
  };
