import { describe, expect, it } from "vitest";

import { liveness, readiness } from "./health";

describe("les sondes de Payload (ADR 0028 §8)", () => {
  it("vie : répond 200 sans rien interroger", async () => {
    const response = liveness();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("disponibilité : 200 quand la base répond et que les migrations sont passées", async () => {
    const response = await readiness(() => Promise.resolve(0));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("disponibilité : 503 quand la base ou ses tables manquent", async () => {
    const response = await readiness(() =>
      Promise.reject(new Error('relation "users" does not exist')),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
  });

  it("ne met jamais en cache une réponse de sonde", async () => {
    const ready = await readiness(() => Promise.resolve(0));

    expect(liveness().headers.get("cache-control")).toBe("no-store");
    expect(ready.headers.get("cache-control")).toBe("no-store");
  });
});
