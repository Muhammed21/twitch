import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import type { AccessTokenIdentity } from "@repo/auth-verifier";
import { responses } from "@repo/contracts";
import { err, ok } from "@repo/result";

import type { AccessTokenVerifier } from "../../../platform/authentication.ts";
import { configureApp } from "../../../platform/configure-app.ts";
import { PlatformModule } from "../../../platform/platform.module.ts";
import type { PresenceStore } from "../application/presence.ts";
import { recordPresence } from "../application/record-presence.ts";
import { PresenceController, RECORD_PRESENCE } from "./presence.controller.ts";

const USER_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const CHANNEL_ID = "00000000-0000-4000-8000-000000000001";
const INSTALLATION_ID = "00000000-0000-4000-8000-0000000000aa";
const INVALID_TOKEN = "jeton-invalide";
const NOW = new Date("2026-11-03T20:00:00.000Z");

const makeIdentity = (): AccessTokenIdentity => ({
  userId: USER_ID,
  sid: "sid-1",
  scopes: [],
  authTime: null,
  amr: [],
  revocation: "checked",
});

const verifier: AccessTokenVerifier = {
  verify: async (token) => (token === INVALID_TOKEN ? err("invalid_token") : ok(makeIdentity())),
};

type Heartbeat = { channelId: string; viewerId: string; at: Date };

const withPresence = async (
  run: (
    post: (
      path: string,
      init: { body?: string; headers?: Readonly<Record<string, string>> },
    ) => Promise<Response>,
    recorded: readonly Heartbeat[],
  ) => Promise<void>,
) => {
  const recorded: Heartbeat[] = [];
  const store: PresenceStore = {
    record: async (heartbeat) => {
      recorded.push(heartbeat);
    },
    count: async () => new Map(),
  };
  const moduleRef = await Test.createTestingModule({
    imports: [
      PlatformModule.register({
        schemaVersionCheck: async () => {},
        logSink: () => {},
        accessTokenVerifier: verifier,
      }),
    ],
    controllers: [PresenceController],
    providers: [{ provide: RECORD_PRESENCE, useValue: recordPresence({ store, now: () => NOW }) }],
  }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.listen(0, "127.0.0.1");
  const url = await app.getUrl();
  try {
    await run(
      (path, init) =>
        fetch(`${url}/v1/channels/${path}`, {
          method: "POST",
          ...init,
          headers: { "content-type": "application/json", ...init.headers },
        }),
      recorded,
    );
  } finally {
    await app.close();
  }
};

const presenceOf = (channelId = CHANNEL_ID) => `${channelId}/presence`;

describe("POST /v1/channels/{channelId}/presence (ADR 0004 §3)", () => {
  it("enregistre le heartbeat du compte du jeton, à l'heure courante", async () => {
    await withPresence(async (post, recorded) => {
      const response = await post(presenceOf(), {
        headers: { authorization: "Bearer jeton" },
        body: JSON.stringify({ viewerId: INSTALLATION_ID }),
      });

      expect(response.status).toBe(204);
      expect(recorded).toEqual([{ channelId: CHANNEL_ID, viewerId: USER_ID, at: NOW }]);
    });
  });

  it("enregistre le heartbeat d'un viewer anonyme par son identifiant d'installation", async () => {
    await withPresence(async (post, recorded) => {
      const response = await post(presenceOf(), {
        body: JSON.stringify({ viewerId: INSTALLATION_ID }),
      });

      expect(response.status).toBe(204);
      expect(recorded).toEqual([{ channelId: CHANNEL_ID, viewerId: INSTALLATION_ID, at: NOW }]);
    });
  });

  it("accepte un heartbeat connecté sans corps", async () => {
    await withPresence(async (post, recorded) => {
      const response = await post(presenceOf(), { headers: { authorization: "Bearer jeton" } });

      expect(response.status).toBe(204);
      expect(recorded).toEqual([{ channelId: CHANNEL_ID, viewerId: USER_ID, at: NOW }]);
    });
  });

  it.each([
    ["sans identifiant d'installation", {}],
    ["avec un identifiant d'installation qui n'est pas un UUID", { viewerId: "appareil-42" }],
  ])("refuse en 400 un heartbeat anonyme %s, sans rien enregistrer", async (_, body) => {
    await withPresence(async (post, recorded) => {
      const response = await post(presenceOf(), { body: JSON.stringify(body) });

      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toContain("application/problem+json");
      expect(responses.Problem.parse(await response.json()).errors).toContainEqual(
        expect.objectContaining({ path: "viewerId" }),
      );
      expect(recorded).toEqual([]);
    });
  });

  it("refuse en 401 un jeton invalide, sans rien enregistrer", async () => {
    await withPresence(async (post, recorded) => {
      const response = await post(presenceOf(), {
        headers: { authorization: `Bearer ${INVALID_TOKEN}` },
        body: JSON.stringify({ viewerId: INSTALLATION_ID }),
      });

      expect(response.status).toBe(401);
      expect(recorded).toEqual([]);
    });
  });

  it("refuse en 400 un identifiant de chaîne qui n'est pas un UUID, sans rien enregistrer", async () => {
    await withPresence(async (post, recorded) => {
      const response = await post(presenceOf("42"), {
        body: JSON.stringify({ viewerId: INSTALLATION_ID }),
      });

      expect(response.status).toBe(400);
      expect(responses.Problem.parse(await response.json()).errors).toContainEqual(
        expect.objectContaining({ path: "channelId" }),
      );
      expect(recorded).toEqual([]);
    });
  });
});
