import { describe, expect, it } from "vitest";

import { createSaturationGuard, type GuardedSocket } from "./saturation-guard.ts";

const MAX_PACKETS = 100;
const CLOSE_AFTER_MS = 10_000;

const makeSocket = (id: string, initialPending = 0) => {
  const state = { pending: initialPending, saturated: false, closed: false, calls: 0 };
  const socket: GuardedSocket = {
    id,
    pendingPackets: () => state.pending,
    saturate: () => {
      state.saturated = true;
      state.calls += 1;
    },
    release: () => {
      state.saturated = false;
      state.calls += 1;
    },
    close: () => {
      state.closed = true;
      state.calls += 1;
    },
  };
  return { socket, state };
};

const startGuard = () =>
  createSaturationGuard({ maxPackets: MAX_PACKETS, closeAfterMs: CLOSE_AFTER_MS });

describe("garde contre les clients lents (ADR 0027, §2)", () => {
  it("laisse dans la diffusion une socket dont le tampon reste au seuil", () => {
    const guard = startGuard();
    const { socket, state } = makeSocket("a", MAX_PACKETS);

    guard.inspect([socket], 0);

    expect(state).toEqual({ pending: MAX_PACKETS, saturated: false, closed: false, calls: 0 });
    expect(guard.saturatedCount()).toBe(0);
  });

  it("exclut de la diffusion une socket qui dépasse le seuil", () => {
    const guard = startGuard();
    const { socket, state } = makeSocket("a", MAX_PACKETS + 1);

    guard.inspect([socket], 0);

    expect(state.saturated).toBe(true);
    expect(guard.saturatedCount()).toBe(1);
  });

  it("rend la diffusion à une socket dès que son tampon repasse sous le seuil", () => {
    const guard = startGuard();
    const { socket, state } = makeSocket("a", MAX_PACKETS + 1);
    guard.inspect([socket], 0);

    state.pending = MAX_PACKETS;
    guard.inspect([socket], 5000);

    expect(state.saturated).toBe(false);
    expect(guard.saturatedCount()).toBe(0);
  });

  it("ferme une socket saturée 10 s d'affilée, et la compte", () => {
    const guard = startGuard();
    const { socket, state } = makeSocket("a", MAX_PACKETS + 1);
    guard.inspect([socket], 1000);

    expect(guard.inspect([socket], 1000 + CLOSE_AFTER_MS - 1)).toEqual({ closed: 0 });
    expect(state.closed).toBe(false);
    expect(guard.inspect([socket], 1000 + CLOSE_AFTER_MS)).toEqual({ closed: 1 });
    expect(state.closed).toBe(true);
    expect(guard.saturatedCount()).toBe(0);
  });

  it("repart de zéro après une sortie de saturation", () => {
    const guard = startGuard();
    const { socket, state } = makeSocket("a", MAX_PACKETS + 1);
    guard.inspect([socket], 0);
    state.pending = 0;
    guard.inspect([socket], 6000);
    state.pending = MAX_PACKETS + 1;
    guard.inspect([socket], 7000);

    guard.inspect([socket], 7000 + CLOSE_AFTER_MS - 1);

    expect(state.closed).toBe(false);
  });

  it("oublie une socket saturée partie d'elle-même", () => {
    const guard = startGuard();
    const { socket } = makeSocket("a", MAX_PACKETS + 1);
    const { socket: other } = makeSocket("b");
    guard.inspect([socket, other], 0);

    guard.inspect([other], 10);

    expect(guard.saturatedCount()).toBe(0);
  });
});
