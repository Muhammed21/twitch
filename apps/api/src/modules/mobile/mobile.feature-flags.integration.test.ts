import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { describe, expect, it } from "vitest";

import { createFeatureFlags } from "./mobile.module.ts";

describe("choix de l'évaluation des flags par FEATURE_FLAGS_PROVIDER", () => {
  it("n'évalue aucun flag avec defaults, pour que chacun garde sa valeur par défaut", async () => {
    expect(await createFeatureFlags({ provider: "defaults" }).evaluate("utilisateur-1")).toEqual(
      {},
    );
  });

  it("évalue les flags auprès de PostHog avec posthog", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({ flags: { session_replay: { key: "session_replay", enabled: true } } }),
      );
    }).listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const host = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

      expect(
        await createFeatureFlags({ provider: "posthog", host, apiKey: "phc_cle" }).evaluate("u"),
      ).toEqual({ session_replay: true });
    } finally {
      server.close();
    }
  });
});
