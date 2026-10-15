import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import type { AccessTokenIdentity } from "@repo/auth-verifier";
import { err, ok } from "@repo/result";

import type { AccessTokenVerifier } from "../../../platform/authentication.ts";
import { configureApp } from "../../../platform/configure-app.ts";
import { PlatformModule } from "../../../platform/platform.module.ts";
import { GET_STREAM_KEY, type GetStreamKey, StreamKeyController } from "./stream-key.controller.ts";

const ACTOR_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const CHANNEL_ID = "9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69";
const CREDENTIALS = { streamKey: "sk_live_tres_secret", ingestUrl: "rtmp://127.0.0.1:1935/live" };

const IDENTITY: AccessTokenIdentity = {
  userId: ACTOR_ID,
  sid: "sid-1",
  scopes: [],
  authTime: null,
  amr: [],
  revocation: "checked",
};

const acceptingVerifier: AccessTokenVerifier = { verify: async () => ok(IDENTITY) };

const withStreamKey = async (
  answer: Awaited<ReturnType<GetStreamKey>>,
  run: (
    base: string,
    context: { requests: Parameters<GetStreamKey>[0][]; logs: string[] },
  ) => Promise<void>,
) => {
  const requests: Parameters<GetStreamKey>[0][] = [];
  const logs: string[] = [];
  const moduleRef = await Test.createTestingModule({
    imports: [
      PlatformModule.register({
        schemaVersionCheck: async () => {},
        logSink: (line) => logs.push(line),
        accessTokenVerifier: acceptingVerifier,
      }),
    ],
    controllers: [StreamKeyController],
    providers: [
      {
        provide: GET_STREAM_KEY,
        useValue: async (request: Parameters<GetStreamKey>[0]) => {
          requests.push(request);
          return answer;
        },
      },
    ],
  }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.listen(0, "127.0.0.1");
  try {
    await run(`${await app.getUrl()}/v1/channels`, { requests, logs });
  } finally {
    await app.close();
  }
};

const withToken = { headers: { authorization: "Bearer jeton" } };

describe("GET /v1/channels/{id}/stream-key", () => {
  it("rend la clé de l'identité du jeton, sans cache", async () => {
    await withStreamKey(ok(CREDENTIALS), async (base, { requests }) => {
      const response = await fetch(`${base}/${CHANNEL_ID}/stream-key`, withToken);

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual(CREDENTIALS);
      expect(requests).toEqual([{ actorId: ACTOR_ID, channelId: CHANNEL_ID }]);
    });
  });

  it("n'écrit jamais la clé dans le journal des requêtes", async () => {
    await withStreamKey(ok(CREDENTIALS), async (base, { logs }) => {
      await fetch(`${base}/${CHANNEL_ID}/stream-key`, withToken);

      expect(logs.length).toBeGreaterThan(0);
      expect(logs.join("\n")).not.toContain(CREDENTIALS.streamKey);
    });
  });

  it("répond 401 sans jeton", async () => {
    await withStreamKey(ok(CREDENTIALS), async (base, { requests }) => {
      const response = await fetch(`${base}/${CHANNEL_ID}/stream-key`);

      expect(response.status).toBe(401);
      expect(requests).toEqual([]);
    });
  });

  it("répond 403 à un autre que le propriétaire", async () => {
    await withStreamKey(err("forbidden"), async (base) => {
      const response = await fetch(`${base}/${CHANNEL_ID}/stream-key`, withToken);

      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ status: 403, title: "Action non autorisée" });
    });
  });

  it("répond 404 pour une chaîne sans canal provider", async () => {
    await withStreamKey(err("not_provisioned"), async (base) => {
      const response = await fetch(`${base}/${CHANNEL_ID}/stream-key`, withToken);

      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        status: 404,
        title: "Clé de stream introuvable",
      });
    });
  });

  it("répond 404 pour un identifiant qui n'est pas un UUID, sans appeler le use-case", async () => {
    await withStreamKey(ok(CREDENTIALS), async (base, { requests }) => {
      const response = await fetch(`${base}/streamer_de_test/stream-key`, withToken);

      expect(response.status).toBe(404);
      expect(requests).toEqual([]);
    });
  });
});
