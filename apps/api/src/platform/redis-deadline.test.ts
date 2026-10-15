import { afterEach, describe, expect, it, vi } from "vitest";

import { REDIS_DEADLINE_MS, withRedisDeadline } from "./redis-deadline.ts";

const never = () => new Promise<never>(() => {});

afterEach(() => {
  vi.useRealTimers();
});

describe("withRedisDeadline", () => {
  it("borne une commande Redis à 2 s", () => {
    expect(REDIS_DEADLINE_MS).toBe(2000);
  });

  it("rend la réponse d'une commande qui répond à temps", async () => {
    expect(await withRedisDeadline(Promise.resolve("OK"))).toBe("OK");
  });

  it("rend l'erreur d'une commande qui échoue à temps", async () => {
    await expect(withRedisDeadline(Promise.reject(new Error("WRONGTYPE")))).rejects.toThrow(
      "WRONGTYPE",
    );
  });

  it("échoue en nommant l'échéance quand la commande ne répond pas en 2 s", async () => {
    vi.useFakeTimers();
    const failure = withRedisDeadline(never()).catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(REDIS_DEADLINE_MS);

    expect(await failure).toEqual(new Error("Redis n'a pas répondu en 2000 ms"));
  });

  it("attend la réponse jusqu'à l'échéance", async () => {
    vi.useFakeTimers();
    const settled = vi.fn<(error: unknown) => void>();
    void withRedisDeadline(never()).catch(settled);

    await vi.advanceTimersByTimeAsync(REDIS_DEADLINE_MS - 1);

    expect(settled).not.toHaveBeenCalled();
  });

  it("ne laisse aucun minuteur après une réponse", async () => {
    vi.useFakeTimers();

    await withRedisDeadline(Promise.resolve("OK"));

    expect(vi.getTimerCount()).toBe(0);
  });

  it("ne laisse aucun minuteur après un échec", async () => {
    vi.useFakeTimers();

    await withRedisDeadline(Promise.reject(new Error("WRONGTYPE"))).catch(() => undefined);

    expect(vi.getTimerCount()).toBe(0);
  });
});
