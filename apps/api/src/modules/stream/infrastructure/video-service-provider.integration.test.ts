import type { ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { describeLiveVideoProviderContract } from "./testing/live-video-provider.contract.ts";
import { startVideoService } from "./testing/video-service.ts";
import { videoServiceProvider } from "./video-service-provider.ts";

const SERVICE_SECRET = randomBytes(32).toString("hex");
const WEBHOOK_SECRET = randomBytes(32).toString("hex");

const service: { process?: ChildProcess; baseUrl: string } = { baseUrl: "" };

beforeAll(async () => {
  Object.assign(service, await startVideoService({ serviceSecret: SERVICE_SECRET }));
});

afterAll(() => {
  service.process?.kill("SIGTERM");
});

const makeProvider = (overrides: { serviceSecret?: string; baseUrl?: string } = {}) =>
  videoServiceProvider({
    baseUrl: overrides.baseUrl ?? service.baseUrl,
    serviceSecret: overrides.serviceSecret ?? SERVICE_SECRET,
    webhookSecret: WEBHOOK_SECRET,
  });

describeLiveVideoProviderContract({
  name: "adapter apps/video",
  webhookSecret: WEBHOOK_SECRET,
  provider: () => makeProvider(),
});

const withServer = async (
  respond: (path: string) => { status: number; body: unknown },
  run: (baseUrl: string) => Promise<void>,
) => {
  const server: Server = createServer((request, response) => {
    const { status, body } = respond(request.url ?? "");
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.close();
  }
};

describe("erreurs du plan de contrôle d'apps/video", () => {
  it("échoue en nommant le refus quand le secret de service est faux, sans rendre de clé", async () => {
    const provider = makeProvider({ serviceSecret: randomBytes(32).toString("hex") });

    await expect(provider.provisionChannel({ channelId: randomUUID() })).rejects.toThrow(/401/);
    await expect(provider.getStreamKey({ providerChannelId: "inconnu" })).rejects.toThrow(/401/);
    await expect(provider.revokeStreamKey({ providerChannelId: "inconnu" })).rejects.toThrow(/401/);
    await expect(provider.listLiveSessions()).rejects.toThrow(/401/);
  });

  it("échoue sur une erreur du service vidéo au lieu de la prendre pour un canal inconnu", async () => {
    await withServer(
      () => ({ status: 500, body: { title: "Erreur interne", status: 500 } }),
      async (baseUrl) => {
        await expect(
          makeProvider({ baseUrl }).getStreamKey({ providerChannelId: "canal" }),
        ).rejects.toThrow(/500/);
      },
    );
  });

  it.each([
    [
      "un provisionnement",
      "/channels",
      (p: ReturnType<typeof makeProvider>) => p.provisionChannel({ channelId: randomUUID() }),
    ],
    [
      "une clé",
      "/stream-key",
      (p: ReturnType<typeof makeProvider>) => p.getStreamKey({ providerChannelId: "canal" }),
    ],
    [
      "une liste de lives",
      "/streams",
      (p: ReturnType<typeof makeProvider>) => p.listLiveSessions(),
    ],
  ])("refuse %s hors contrat", async (_, path, call) => {
    await withServer(
      (requested) => ({ status: requested.endsWith(path) ? 200 : 404, body: { streamKey: "" } }),
      async (baseUrl) => {
        await expect(call(makeProvider({ baseUrl }))).rejects.toThrow(/contrat/);
      },
    );
  });

  it.each([
    [
      "un provisionnement",
      (p: ReturnType<typeof makeProvider>) => p.provisionChannel({ channelId: randomUUID() }),
    ],
    ["une liste de lives", (p: ReturnType<typeof makeProvider>) => p.listLiveSessions()],
  ])("échoue sur %s introuvable, au lieu de rendre un résultat vide", async (_, call) => {
    await withServer(
      () => ({ status: 404, body: { title: "Ressource introuvable", status: 404 } }),
      async (baseUrl) => {
        await expect(call(makeProvider({ baseUrl }))).rejects.toThrow(/404/);
      },
    );
  });
});

describe("lives en cours sur apps/video", () => {
  it("rend la session de chaque live listé par GET /streams", async () => {
    await withServer(
      () => ({
        status: 200,
        body: {
          streams: [
            { sessionId: "session-1", channelId: "canal-1", startedAt: "2026-10-15T20:00:00.000Z" },
            { sessionId: "session-2", channelId: "canal-2", startedAt: "2026-10-15T20:01:00.000Z" },
          ],
        },
      }),
      async (baseUrl) => {
        expect(await makeProvider({ baseUrl }).listLiveSessions()).toEqual([
          { providerSessionId: "session-1" },
          { providerSessionId: "session-2" },
        ]);
      },
    );
  });
});
