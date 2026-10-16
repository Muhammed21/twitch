import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import type { AccessTokenIdentity } from "@repo/auth-verifier";
import { err, ok } from "@repo/result";

import type { AccessTokenVerifier } from "../../../platform/authentication.ts";
import { configureApp } from "../../../platform/configure-app.ts";
import { PlatformModule } from "../../../platform/platform.module.ts";
import type { TimeoutRequest } from "../application/timeout-user.ts";
import { TIMEOUT_USER, type TimeoutUser, TimeoutsController } from "./timeouts.controller.ts";

const ACTOR_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const CHANNEL_ID = "9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69";
const VIEWER_ID = "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e";

const IDENTITY: AccessTokenIdentity = {
  userId: ACTOR_ID,
  sid: "sid-1",
  scopes: [],
  authTime: null,
  amr: [],
  revocation: "checked",
};

const acceptingVerifier: AccessTokenVerifier = { verify: async () => ok(IDENTITY) };

const TIMED_OUT = ok({
  channelId: CHANNEL_ID,
  userId: VIEWER_ID,
  expiresAt: new Date("2026-10-15T20:10:00.000Z"),
  cacheInvalidated: true,
});

const withTimeouts = async (
  answer: Awaited<ReturnType<TimeoutUser>>,
  run: (base: string, requests: TimeoutRequest[]) => Promise<void>,
) => {
  const requests: TimeoutRequest[] = [];
  const moduleRef = await Test.createTestingModule({
    imports: [
      PlatformModule.register({
        schemaVersionCheck: async () => {},
        logSink: () => {},
        accessTokenVerifier: acceptingVerifier,
      }),
    ],
    controllers: [TimeoutsController],
    providers: [
      {
        provide: TIMEOUT_USER,
        useValue: async (request: TimeoutRequest) => {
          requests.push(request);
          return answer;
        },
      },
    ],
  }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.listen(0, "127.0.0.1");
  try {
    await run(`${await app.getUrl()}/v1/channels`, requests);
  } finally {
    await app.close();
  }
};

const postTimeout = (
  base: string,
  {
    channel = CHANNEL_ID,
    body = { userId: VIEWER_ID, durationSeconds: 600 },
    token = true,
  }: { channel?: string; body?: unknown; token?: boolean } = {},
) =>
  fetch(`${base}/${channel}/timeouts`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: "Bearer jeton" } : {}),
    },
    body: JSON.stringify(body),
  });

describe("POST /v1/channels/{id}/timeouts", () => {
  it("met en timeout au nom de l'identité du jeton et rend la fin du timeout", async () => {
    await withTimeouts(TIMED_OUT, async (base, requests) => {
      const response = await postTimeout(base);

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({
        channelId: CHANNEL_ID,
        userId: VIEWER_ID,
        expiresAt: "2026-10-15T20:10:00.000Z",
      });
      expect(requests).toEqual([
        { actorId: ACTOR_ID, channelId: CHANNEL_ID, targetId: VIEWER_ID, durationSeconds: 600 },
      ]);
    });
  });

  it("répond 401 sans jeton, sans rien sanctionner", async () => {
    await withTimeouts(TIMED_OUT, async (base, requests) => {
      const response = await postTimeout(base, { token: false });

      expect(response.status).toBe(401);
      expect(requests).toEqual([]);
    });
  });

  it("répond 403 à un autre que le propriétaire", async () => {
    await withTimeouts(err("forbidden"), async (base) => {
      const response = await postTimeout(base);

      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ status: 403, title: "Action non autorisée" });
    });
  });

  it("répond 422 pour une durée hors bornes, en donnant les bornes", async () => {
    await withTimeouts(err("invalid_duration"), async (base) => {
      const response = await postTimeout(base);

      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({
        status: 422,
        title: "Durée invalide",
        detail: "Un timeout dure de 1 à 1209600 secondes.",
      });
    });
  });

  it("répond 404 pour une chaîne qui n'est pas un UUID, sans rien sanctionner", async () => {
    await withTimeouts(TIMED_OUT, async (base, requests) => {
      const response = await postTimeout(base, { channel: "streamer_de_test" });

      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ status: 404, title: "Chaîne introuvable" });
      expect(requests).toEqual([]);
    });
  });

  it.each([
    ["un utilisateur qui n'est pas un UUID", { userId: "viewer", durationSeconds: 600 }],
    ["sans utilisateur", { durationSeconds: 600 }],
    ["sans durée", { userId: VIEWER_ID }],
    ["une durée qui n'est pas un entier", { userId: VIEWER_ID, durationSeconds: 1.5 }],
    ["une durée en texte", { userId: VIEWER_ID, durationSeconds: "600" }],
    ["un champ inconnu", { userId: VIEWER_ID, durationSeconds: 600, permanent: true }],
  ])("répond 400 pour un corps avec %s, sans rien sanctionner", async (_name, body) => {
    await withTimeouts(TIMED_OUT, async (base, requests) => {
      const response = await postTimeout(base, { body });

      expect(response.status).toBe(400);
      expect(requests).toEqual([]);
    });
  });
});
