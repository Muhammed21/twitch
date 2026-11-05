import { describe, expect, it } from "vitest";

import { err, ok } from "@repo/result";

import type { TurboEntitlement } from "../domain/turbo-entitlement.ts";
import { type ObserveTurbo, syncTurboEntitlement } from "./sync-turbo-entitlement.ts";
import { memoryTurboLedger } from "./testing/memory-turbo-ledger.ts";

const USER_ID = "8d0a4c1e-5b6f-4a7d-9e8c-1f2a3b4c5d6e";
const NEW_ID = "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f";
const OBSERVED_AT = new Date("2026-11-08T09:00:00.000Z");
const EXPIRES_AT = new Date("2026-12-08T09:00:00.000Z");

const newId = () => NEW_ID;

const activeSubscriber: ObserveTurbo = async (userId) =>
  ok({
    kind: "observed",
    userId,
    occurredAt: OBSERVED_AT,
    state: { expiresAt: EXPIRES_AT, willRenew: true, inGrace: false },
  });

const makeEntitlement = (overrides: Partial<TurboEntitlement> = {}): TurboEntitlement => ({
  id: "6f7a8b9c-0d1e-4f2a-8b3c-4d5e6f7a8b9c",
  userId: USER_ID,
  status: "active",
  expiresAt: EXPIRES_AT,
  willRenew: true,
  providerReference: "2000000123456789",
  lastEventAt: new Date("2026-11-08T08:59:00.000Z"),
  ...overrides,
});

const syncWith = (observe: ObserveTurbo, existing: readonly TurboEntitlement[] = []) => {
  const memory = memoryTurboLedger(existing);
  const sync = syncTurboEntitlement({
    observe,
    transact: async (work) => work(memory.ledger),
    newId,
  });
  return { ...memory, sync };
};

describe("resynchronisation de Turbo après achat (ADR 0051 §2)", () => {
  it("rend actif chez nous un abonné actif chez RevenueCat et publie granted", async () => {
    const { sync, rows, published } = syncWith(activeSubscriber);

    expect(await sync(USER_ID)).toEqual({ ok: true, value: "applied" });
    expect(rows()).toEqual([
      expect.objectContaining({
        id: NEW_ID,
        userId: USER_ID,
        status: "active",
        expiresAt: EXPIRES_AT,
      }),
    ]);
    expect(published).toEqual([
      { type: "granted", userId: USER_ID, expiresAt: EXPIRES_AT, occurredAt: OBSERVED_AT },
    ]);
  });

  it("n'écrit aucun event pour un état déjà appliqué", async () => {
    const { sync, published } = syncWith(activeSubscriber, [makeEntitlement()]);

    await sync(USER_ID);

    expect(published).toEqual([]);
  });

  it("ignore une observation plus ancienne que le dernier événement appliqué", async () => {
    const { sync, published } = syncWith(activeSubscriber, [
      makeEntitlement({
        lastEventAt: new Date("2026-11-08T09:00:01.000Z"),
        expiresAt: OBSERVED_AT,
      }),
    ]);

    expect(await sync(USER_ID)).toEqual({ ok: true, value: "stale" });
    expect(published).toEqual([]);
  });

  it("rend unavailable sans toucher à l'entitlement quand RevenueCat ne répond pas", async () => {
    const existing = makeEntitlement();
    const { sync, rows, published, locks } = syncWith(async () => err("unavailable"), [existing]);

    expect(await sync(USER_ID)).toEqual({ ok: false, error: "unavailable" });
    expect(rows()).toEqual([existing]);
    expect(published).toEqual([]);
    expect(locks).toEqual([]);
  });
});
