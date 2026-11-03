import { afterEach, describe, expect, it, vi } from "vitest";

import { redisRevokedSessions } from "./redis-revoked-sessions.ts";

afterEach(() => {
  vi.useRealTimers();
});

describe("redisRevokedSessions", () => {
  it("lit la clé de révocation de la session posée par l'API", async () => {
    const keys: string[] = [];
    const revokedSessions = redisRevokedSessions({
      exists: async (key) => {
        keys.push(key);
        return 1;
      },
    });

    expect(await revokedSessions.isRevoked("sid-1")).toBe(true);
    expect(keys).toEqual(["identity:revoked-sid:sid-1"]);
  });

  it("ne voit pas révoquée une session sans clé", async () => {
    expect(await redisRevokedSessions({ exists: async () => 0 }).isRevoked("sid-1")).toBe(false);
  });

  it("abandonne la lecture au bout de 200 ms, pas avant", async () => {
    vi.useFakeTimers();
    const outcome = redisRevokedSessions({ exists: () => new Promise<number>(() => {}) })
      .isRevoked("sid-1")
      .then(
        () => "lu",
        (error: unknown) => (error instanceof Error ? error.message : "inconnu"),
      );
    const settled = vi.fn<(outcome: string) => void>();
    void outcome.then(settled);

    await vi.advanceTimersByTimeAsync(199);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await outcome).toBe("Redis n'a pas répondu en 200 ms");
  });

  it("libère le délai quand Redis répond", async () => {
    vi.useFakeTimers();
    await redisRevokedSessions({ exists: async () => 0 }).isRevoked("sid-1");

    expect(vi.getTimerCount()).toBe(0);
  });

  it("transmet l'erreur de Redis et libère le délai", async () => {
    vi.useFakeTimers();
    const failing = redisRevokedSessions({
      exists: async () => {
        throw new Error("connexion refusée");
      },
    }).isRevoked("sid-1");

    await expect(failing).rejects.toThrow("connexion refusée");
    expect(vi.getTimerCount()).toBe(0);
  });
});
