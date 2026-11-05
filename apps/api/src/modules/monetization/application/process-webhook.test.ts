import { describe, expect, it } from "vitest";

import { err, ok } from "@repo/result";

import type { TurboCommand } from "./apply-turbo-command.ts";
import { processWebhook, type WebhookSkip } from "./process-webhook.ts";
import { memoryTurboLedger } from "./testing/memory-turbo-ledger.ts";

const USER_ID = "8d0a4c1e-5b6f-4a7d-9e8c-1f2a3b4c5d6e";
const EVENT_ID = "CDD5C0A2-5C5E-4E4E-9C8A-2E1A6B0F7D11";
const PAYLOAD = { event: { id: EVENT_ID } };

const PURCHASE: TurboCommand = {
  kind: "apply",
  event: {
    kind: "purchased",
    userId: USER_ID,
    occurredAt: new Date("2026-11-08T09:00:00.000Z"),
    expiresAt: new Date("2026-12-08T09:00:00.000Z"),
    providerReference: undefined,
  },
};

describe("traitement d'un webhook reçu", () => {
  it("applique la commande traduite et rend le résultat de la décision", async () => {
    const { ledger, published } = memoryTurboLedger();
    const translated: unknown[] = [];

    const outcome = await processWebhook({
      translate: (payload) => {
        translated.push(payload);
        return ok(PURCHASE);
      },
      newId: () => "f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b",
      alert: () => {},
    })({ eventId: EVENT_ID, payload: PAYLOAD }, ledger);

    expect(outcome).toBe("applied");
    expect(translated).toEqual([PAYLOAD]);
    expect(published).toHaveLength(1);
  });

  it("écarte un événement non traité, l'alerte et n'écrit rien", async () => {
    const { ledger, rows, published } = memoryTurboLedger();
    const alerts: WebhookSkip[] = [];

    const outcome = await processWebhook({
      translate: () => err("unhandled_type"),
      newId: () => "f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b",
      alert: (skip) => {
        alerts.push(skip);
      },
    })({ eventId: EVENT_ID, payload: PAYLOAD }, ledger);

    expect(outcome).toBe("unhandled_type");
    expect(alerts).toEqual([{ eventId: EVENT_ID, reason: "unhandled_type" }]);
    expect(rows()).toEqual([]);
    expect(published).toEqual([]);
  });
});
