const NO_STORE = { "cache-control": "no-store" };

export const liveness = (): Response => Response.json({ status: "ok" }, { headers: NO_STORE });

export const readiness = (probe: () => Promise<unknown>): Promise<Response> =>
  probe().then(
    () => Response.json({ status: "ok" }, { headers: NO_STORE }),
    () => Response.json({ status: "unavailable" }, { status: 503, headers: NO_STORE }),
  );
