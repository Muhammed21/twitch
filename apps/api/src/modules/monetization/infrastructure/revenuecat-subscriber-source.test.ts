import { describe, expect, it } from "vitest";

import { revenueCatSubscriberSource } from "./revenuecat-subscriber-source.ts";

const USER_ID = "8d0a4c1e-5b6f-4a7d-9e8c-1f2a3b4c5d6e";
const API_KEY = "cle-secrete-de-test";
const REQUEST_DATE_MS = Date.UTC(2026, 10, 8, 9);

const SUBSCRIBER = {
  request_date_ms: REQUEST_DATE_MS,
  subscriber: { entitlements: {}, subscriptions: {} },
};

type Call = { url: string; init: RequestInit | undefined };

const makeFetch = (respond: () => Promise<Response>) => {
  const calls: Call[] = [];
  const fetch = async (input: string, init?: RequestInit) => {
    calls.push({ url: input, init });
    return respond();
  };
  return { calls, fetch };
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("lecture d'un abonné chez RevenueCat (API REST v1)", () => {
  it("lit l'abonné avec la clé secrète et rend son observation Turbo", async () => {
    const { calls, fetch } = makeFetch(async () => json(200, SUBSCRIBER));

    const observed = await revenueCatSubscriberSource({ apiKey: API_KEY, fetch })(USER_ID);

    expect(observed).toEqual({
      ok: true,
      value: {
        kind: "observed",
        userId: USER_ID,
        occurredAt: new Date(REQUEST_DATE_MS),
        state: undefined,
      },
    });
    expect(calls).toEqual([
      {
        url: `https://api.revenuecat.com/v1/subscribers/${USER_ID}`,
        init: expect.objectContaining({
          method: "GET",
          headers: { authorization: `Bearer ${API_KEY}`, accept: "application/json" },
          signal: expect.any(AbortSignal),
        }),
      },
    ]);
  });

  it("encode l'identifiant dans le chemin", async () => {
    const { calls, fetch } = makeFetch(async () => json(200, SUBSCRIBER));

    await revenueCatSubscriberSource({ apiKey: API_KEY, fetch })("a/b c");

    expect(calls[0]?.url).toBe("https://api.revenuecat.com/v1/subscribers/a%2Fb%20c");
  });

  it.each([
    ["une erreur réseau", async () => Promise.reject(new Error("ECONNRESET"))],
    ["une réponse 500", async () => json(500, { message: "panne" })],
    ["une réponse 503 qui porte un abonné", async () => json(503, SUBSCRIBER)],
    ["une réponse 401", async () => json(401, { message: "clé invalide" })],
    ["une réponse 429", async () => json(429, { message: "trop de requêtes" })],
    ["un corps qui n'est pas du JSON", async () => new Response("<html>", { status: 200 })],
    ["un corps hors contrat", async () => json(200, { subscriber: null })],
  ])("rend unavailable sur %s", async (_name, respond) => {
    const { fetch } = makeFetch(respond);

    expect(await revenueCatSubscriberSource({ apiKey: API_KEY, fetch })(USER_ID)).toEqual({
      ok: false,
      error: "unavailable",
    });
  });
});
