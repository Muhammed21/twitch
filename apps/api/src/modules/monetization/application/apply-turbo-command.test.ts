import { describe, expect, it } from "vitest";

import type { TurboEntitlement } from "../domain/turbo-entitlement.ts";
import { applyTurboCommand } from "./apply-turbo-command.ts";
import { memoryTurboLedger } from "./testing/memory-turbo-ledger.ts";

const USER_ID = "8d0a4c1e-5b6f-4a7d-9e8c-1f2a3b4c5d6e";
const OTHER_USER_ID = "2b7c9d1e-3f4a-4b5c-8d6e-7f8a9b0c1d2e";
const NEW_ID = "f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b";

const OCCURRED_AT = new Date("2026-11-08T09:00:00.000Z");
const EXPIRES_AT = new Date("2026-12-08T09:00:00.000Z");

const newId = () => NEW_ID;

const makeEntitlement = (overrides: Partial<TurboEntitlement> = {}): TurboEntitlement => ({
  id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  userId: USER_ID,
  status: "active",
  expiresAt: EXPIRES_AT,
  willRenew: true,
  providerReference: undefined,
  lastEventAt: new Date("2026-11-01T09:00:00.000Z"),
  ...overrides,
});

describe("application d'une commande Turbo", () => {
  it("verrouille l'acheteur, enregistre l'entitlement et publie son accord à l'instant de l'événement", async () => {
    const { ledger, rows, published, locks } = memoryTurboLedger();

    const decision = await applyTurboCommand({
      ledger,
      newId,
      command: {
        kind: "apply",
        event: {
          kind: "purchased",
          userId: USER_ID,
          occurredAt: OCCURRED_AT,
          expiresAt: EXPIRES_AT,
          providerReference: undefined,
        },
      },
    });

    expect(decision.outcome).toBe("applied");
    expect(locks).toEqual([[USER_ID]]);
    expect(rows()).toEqual([expect.objectContaining({ id: NEW_ID, status: "active" })]);
    expect(published).toEqual([
      { type: "granted", userId: USER_ID, expiresAt: EXPIRES_AT, occurredAt: OCCURRED_AT },
    ]);
  });

  it("n'écrit rien pour un événement antérieur au dernier appliqué", async () => {
    const current = makeEntitlement({ lastEventAt: new Date("2026-11-09T09:00:00.000Z") });
    const { ledger, rows, published } = memoryTurboLedger([current]);

    const decision = await applyTurboCommand({
      ledger,
      newId,
      command: {
        kind: "apply",
        event: { kind: "expired", userId: USER_ID, occurredAt: OCCURRED_AT },
      },
    });

    expect(decision.outcome).toBe("stale");
    expect(rows()).toEqual([current]);
    expect(published).toEqual([]);
  });

  it("transfère depuis les origines connues vers la cible, en les verrouillant toutes", async () => {
    const origin = makeEntitlement();
    const { ledger, rows, published, locks } = memoryTurboLedger([origin]);
    const unknownOrigin = "5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f";

    await applyTurboCommand({
      ledger,
      newId,
      command: {
        kind: "transfer",
        fromUserIds: [USER_ID, unknownOrigin],
        toUserId: OTHER_USER_ID,
        occurredAt: OCCURRED_AT,
      },
    });

    expect(locks).toEqual([[USER_ID, unknownOrigin, OTHER_USER_ID]]);
    expect(rows()).toEqual([
      { ...origin, status: "revoked", lastEventAt: OCCURRED_AT },
      expect.objectContaining({ id: NEW_ID, userId: OTHER_USER_ID, status: "active" }),
    ]);
    expect(published).toEqual([
      { type: "revoked", userId: USER_ID, occurredAt: OCCURRED_AT },
      { type: "granted", userId: OTHER_USER_ID, expiresAt: EXPIRES_AT, occurredAt: OCCURRED_AT },
    ]);
  });
});
