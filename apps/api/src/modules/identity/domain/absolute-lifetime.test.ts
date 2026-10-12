import { describe, expect, it } from "vitest";

import { exceedsAbsoluteLifetime } from "./absolute-lifetime.ts";

const NOW = new Date("2026-10-12T12:00:00.000Z");

const daysBefore = (days: number, milliseconds = 0) =>
  new Date(NOW.getTime() - days * 86_400_000 - milliseconds);

describe("plafond absolu de 180 jours depuis l'authentification (ADR 0026 §4)", () => {
  it("laisse rafraîchir une session authentifiée il y a moins de 180 jours", () => {
    expect(exceedsAbsoluteLifetime({ authTime: daysBefore(179), now: NOW })).toBe(false);
  });

  it("laisse rafraîchir une session authentifiée il y a exactement 180 jours", () => {
    expect(exceedsAbsoluteLifetime({ authTime: daysBefore(180), now: NOW })).toBe(false);
  });

  it("refuse une session authentifiée il y a plus de 180 jours", () => {
    expect(exceedsAbsoluteLifetime({ authTime: daysBefore(180, 1), now: NOW })).toBe(true);
  });

  it("refuse une session dont l'heure d'authentification est inconnue", () => {
    expect(exceedsAbsoluteLifetime({ authTime: null, now: NOW })).toBe(true);
  });
});
