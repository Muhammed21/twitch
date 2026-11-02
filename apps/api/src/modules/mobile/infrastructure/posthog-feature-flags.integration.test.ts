import { once } from "node:events";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { describe, expect, it } from "vitest";

import { posthogFeatureFlags } from "./posthog-feature-flags.ts";

const API_KEY = "phc_cle_de_projet";

type ReceivedRequest = { method: string; url: string; contentType: string; body: unknown };

const readBody = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  request.on("data", (chunk: Buffer) => chunks.push(chunk));
  await once(request, "end");
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

const withPostHog = async (
  respond: () => { status: number; body: unknown },
  run: (host: string, received: readonly ReceivedRequest[]) => Promise<void>,
) => {
  const received: ReceivedRequest[] = [];
  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    received.push({
      method: request.method ?? "",
      url: request.url ?? "",
      contentType: request.headers["content-type"] ?? "",
      body: await readBody(request),
    });
    const { status, body } = respond();
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  };
  const server: Server = createServer((request, response) => {
    void handle(request, response);
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, received);
  } finally {
    server.close();
  }
};

const makeFlag = (key: string, overrides: Record<string, unknown> = {}) => ({
  key,
  enabled: false,
  variant: null,
  ...overrides,
});

describe("flags évalués par PostHog", () => {
  it("évalue les flags de l'utilisateur par POST /flags, avec la clé de projet", async () => {
    await withPostHog(
      () => ({ status: 200, body: { flags: {}, errorsWhileComputingFlags: false } }),
      async (host, received) => {
        await posthogFeatureFlags({ host, apiKey: API_KEY }).evaluate("utilisateur-1");

        expect(received).toEqual([
          {
            method: "POST",
            url: "/flags/?v=2",
            contentType: "application/json",
            body: { api_key: API_KEY, distinct_id: "utilisateur-1" },
          },
        ]);
      },
    );
  });

  it("rend l'état d'un flag booléen et la variante d'un flag multivarié", async () => {
    await withPostHog(
      () => ({
        status: 200,
        body: {
          flags: {
            session_replay: makeFlag("session_replay", { enabled: true }),
            chat_coalescence: makeFlag("chat_coalescence"),
            paywall_variant: makeFlag("paywall_variant", { enabled: true, variant: "b" }),
          },
          errorsWhileComputingFlags: false,
        },
      }),
      async (host) => {
        expect(await posthogFeatureFlags({ host, apiKey: API_KEY }).evaluate("u")).toEqual({
          session_replay: true,
          chat_coalescence: false,
          paywall_variant: "b",
        });
      },
    );
  });

  it("échoue en nommant le statut quand PostHog refuse l'appel", async () => {
    await withPostHog(
      () => ({ status: 401, body: { type: "authentication_error" } }),
      async (host) => {
        await expect(posthogFeatureFlags({ host, apiKey: API_KEY }).evaluate("u")).rejects.toThrow(
          /401/,
        );
      },
    );
  });

  it("échoue sur une réponse hors du format attendu", async () => {
    await withPostHog(
      () => ({ status: 200, body: { featureFlags: { session_replay: true } } }),
      async (host) => {
        await expect(posthogFeatureFlags({ host, apiKey: API_KEY }).evaluate("u")).rejects.toThrow(
          /format/,
        );
      },
    );
  });
});

describe("PostHog qui ne répond plus", () => {
  it("abandonne l'évaluation après 500 ms, en nommant le délai dépassé", async () => {
    const server = createServer(() => {}).listen(0, "127.0.0.1");
    await once(server, "listening");
    const host = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const startedAt = performance.now();
    try {
      await expect(posthogFeatureFlags({ host, apiKey: API_KEY }).evaluate("u")).rejects.toThrow(
        /délai de 500 ms/,
      );

      const elapsed = performance.now() - startedAt;
      expect(elapsed).toBeGreaterThan(400);
      expect(elapsed).toBeLessThan(1000);
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });

  it("laisse remonter un refus de connexion tel quel, sans le confondre avec un délai dépassé", async () => {
    const server = createServer().listen(0, "127.0.0.1");
    await once(server, "listening");
    const host = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    server.close();
    await once(server, "close");

    const failure = await posthogFeatureFlags({ host, apiKey: API_KEY })
      .evaluate("u")
      .then(
        () => "aucune erreur",
        (error: unknown) => (error instanceof Error ? error.message : String(error)),
      );

    expect(failure).toBe("fetch failed");
  });
});
