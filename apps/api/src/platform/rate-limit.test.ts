import { describe, expect, it } from "vitest";

import {
  fixedWindowLimiter,
  mostRestrictive,
  tooManyRequests,
  type WindowCounter,
} from "./rate-limit.ts";
import { memoryWindowCounter } from "./testing/memory-window-counter.ts";

const WINDOW_START = new Date("2026-11-03T20:00:00.000Z");

const after = (ms: number) => new Date(WINDOW_START.getTime() + ms);

const makeLimiter = (counter: WindowCounter) =>
  fixedWindowLimiter({ counter, name: "presence", limit: 2, windowMs: 60_000 });

describe("limite de débit à fenêtre fixe (ADR 0042)", () => {
  it("admet les requêtes jusqu'à la limite, puis refuse jusqu'à la fin de la fenêtre", async () => {
    const limit = makeLimiter(memoryWindowCounter().counter);

    expect(await limit("203.0.113.7", after(0))).toEqual({ allowed: true });
    expect(await limit("203.0.113.7", after(1000))).toEqual({ allowed: true });
    expect(await limit("203.0.113.7", after(20_000))).toEqual({
      allowed: false,
      retryAfterSeconds: 40,
    });
  });

  it("arrondit l'attente à la seconde supérieure, sans jamais descendre sous une seconde", async () => {
    const limit = makeLimiter(memoryWindowCounter().counter);
    await limit("203.0.113.7", after(0));
    await limit("203.0.113.7", after(0));

    expect(await limit("203.0.113.7", after(20_001))).toEqual({
      allowed: false,
      retryAfterSeconds: 40,
    });
    expect(await limit("203.0.113.7", after(59_999))).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
  });

  it("repart de zéro à la fenêtre suivante", async () => {
    const limit = makeLimiter(memoryWindowCounter().counter);
    await limit("203.0.113.7", after(0));
    await limit("203.0.113.7", after(0));
    await limit("203.0.113.7", after(0));

    expect(await limit("203.0.113.7", after(60_000))).toEqual({ allowed: true });
  });

  it("compte chaque sujet à part, sous une clé qui porte le nom de la limite et sa fenêtre", async () => {
    const { counter, calls } = memoryWindowCounter();
    const limit = makeLimiter(counter);
    await limit("203.0.113.7", after(0));
    await limit("203.0.113.7", after(0));

    expect(await limit("198.51.100.66", after(0))).toEqual({ allowed: true });
    expect(calls.at(-1)).toEqual({
      key: `ratelimit:presence:198.51.100.66:${WINDOW_START.getTime() / 60_000}`,
      ttlMs: 60_000,
    });
  });
});

describe("plusieurs limites sur une même requête", () => {
  it("admet la requête quand toutes les limites l'admettent", () => {
    expect(mostRestrictive([{ allowed: true }, { allowed: true }])).toEqual({ allowed: true });
  });

  it("refuse avec l'attente la plus longue des limites dépassées", () => {
    expect(
      mostRestrictive([
        { allowed: false, retryAfterSeconds: 12 },
        { allowed: true },
        { allowed: false, retryAfterSeconds: 40 },
        { allowed: false, retryAfterSeconds: 3 },
      ]),
    ).toEqual({ allowed: false, retryAfterSeconds: 40 });
  });
});

describe("réponse d'une requête refusée", () => {
  it("est un 429 RFC 9457 qui dit quand réessayer", () => {
    const refusal = tooManyRequests(40);

    expect(refusal.problem).toEqual({
      type: "about:blank",
      title: "Trop de requêtes",
      status: 429,
      detail: "Réessayez dans 40 s.",
    });
    expect(refusal.headers).toEqual({ "retry-after": "40" });
  });
});
