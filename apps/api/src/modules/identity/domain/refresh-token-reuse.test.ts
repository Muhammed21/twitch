import { describe, expect, it } from "vitest";

import { isRefreshTokenReuse } from "./refresh-token-reuse.ts";

const NOW = new Date("2026-10-12T12:00:00.000Z");

const secondsFromNow = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

const ACTIVE = { revoked: null, rotationReplayExpiresAt: null };

const CONSUMED_BY_ROTATION = { revoked: secondsFromNow(-10) };

describe("réutilisation d'un refresh token (ADR 0026 §3)", () => {
  it("n'en voit pas dans un jeton encore actif", () => {
    expect(isRefreshTokenReuse({ token: ACTIVE, now: NOW })).toBe(false);
  });

  it("n'en voit pas dans un rejeu pendant la fenêtre de 30 s", () => {
    const token = { ...CONSUMED_BY_ROTATION, rotationReplayExpiresAt: secondsFromNow(20) };

    expect(isRefreshTokenReuse({ token, now: NOW })).toBe(false);
  });

  it("n'en voit pas au dernier instant de la fenêtre", () => {
    const token = { ...CONSUMED_BY_ROTATION, rotationReplayExpiresAt: NOW };

    expect(isRefreshTokenReuse({ token, now: NOW })).toBe(false);
  });

  it("en voit une dans un jeton consommé rejoué après la fenêtre", () => {
    const token = { ...CONSUMED_BY_ROTATION, rotationReplayExpiresAt: secondsFromNow(-1) };

    expect(isRefreshTokenReuse({ token, now: NOW })).toBe(true);
  });

  it("en voit une dans un jeton révoqué sans rotation", () => {
    const token = { revoked: secondsFromNow(-10), rotationReplayExpiresAt: null };

    expect(isRefreshTokenReuse({ token, now: NOW })).toBe(true);
  });
});
