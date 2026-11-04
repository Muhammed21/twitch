import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import type { AccessTokenIdentity } from "@repo/auth-verifier";
import { responses } from "@repo/contracts";
import { err, ok } from "@repo/result";

import type { AccessTokenVerifier } from "../../../platform/authentication.ts";
import { CLIENT_IP_OF, clientIpOf } from "../../../platform/client-ip.ts";
import { configureApp } from "../../../platform/configure-app.ts";
import { PlatformModule } from "../../../platform/platform.module.ts";
import { memoryWindowCounter } from "../../../platform/testing/memory-window-counter.ts";
import type { PresenceStore } from "../application/presence.ts";
import { recordPresence } from "../application/record-presence.ts";
import { PRESENCE_RATE_LIMIT, presenceRateLimit } from "./presence-rate-limit.ts";
import { PresenceController, RECORD_PRESENCE } from "./presence.controller.ts";

const USER_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const CHANNEL_ID = "00000000-0000-4000-8000-000000000001";
const INSTALLATION_ID = "00000000-0000-4000-8000-0000000000aa";
const INVALID_TOKEN = "jeton-invalide";
const OTHER_CHANNEL_ID = "00000000-0000-4000-8000-000000000002";
const LETTERED_CHANNEL_ID = "9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69";
const NOW = new Date("2026-11-03T20:00:20.000Z");
const CLIENT_IP = "203.0.113.7";
const FORGED_IP = "198.51.100.66";

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
  options: { trustedProxyCount?: number },
  run: (
    post: (
      path: string,
      init: { body?: string; headers?: Readonly<Record<string, string>> },
    ) => Promise<Response>,
    recorded: readonly Heartbeat[],
    counted: readonly { key: string; ttlMs: number }[],
    viewersOf: (channelId: string) => Promise<number | undefined>,
  ) => Promise<void>,
) => {
  const recorded: Heartbeat[] = [];
  const window = memoryWindowCounter();
  const store: PresenceStore = {
    record: async (heartbeat) => {
      recorded.push(heartbeat);
    },
    count: async ({ channelIds }) =>
      new Map(
        channelIds.map((channelId) => [
          channelId,
          new Set(
            recorded.filter((beat) => beat.channelId === channelId).map((beat) => beat.viewerId),
          ).size,
        ]),
      ),
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
    providers: [
      { provide: RECORD_PRESENCE, useValue: recordPresence({ store, now: () => NOW }) },
      {
        provide: PRESENCE_RATE_LIMIT,
        useValue: presenceRateLimit({ counter: window.counter, now: () => NOW }),
      },
      { provide: CLIENT_IP_OF, useValue: clientIpOf(options.trustedProxyCount ?? 0) },
    ],
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
      window.calls,
      async (channelId) => (await store.count({ channelIds: [channelId], at: NOW })).get(channelId),
    );
  } finally {
    await app.close();
  }
};

const presenceOf = (channelId = CHANNEL_ID) => `${channelId}/presence`;

describe("POST /v1/channels/{channelId}/presence (ADR 0004 §3)", () => {
  it("enregistre le heartbeat du compte du jeton, à l'heure courante", async () => {
    await withPresence({}, async (post, recorded) => {
      const response = await post(presenceOf(), {
        headers: { authorization: "Bearer jeton" },
        body: JSON.stringify({ viewerId: INSTALLATION_ID }),
      });

      expect(response.status).toBe(204);
      expect(recorded).toEqual([{ channelId: CHANNEL_ID, viewerId: USER_ID, at: NOW }]);
    });
  });

  it("enregistre le heartbeat d'un viewer anonyme par son identifiant d'installation", async () => {
    await withPresence({}, async (post, recorded) => {
      const response = await post(presenceOf(), {
        body: JSON.stringify({ viewerId: INSTALLATION_ID }),
      });

      expect(response.status).toBe(204);
      expect(recorded).toEqual([{ channelId: CHANNEL_ID, viewerId: INSTALLATION_ID, at: NOW }]);
    });
  });

  it("accepte un heartbeat connecté sans corps", async () => {
    await withPresence({}, async (post, recorded) => {
      const response = await post(presenceOf(), { headers: { authorization: "Bearer jeton" } });

      expect(response.status).toBe(204);
      expect(recorded).toEqual([{ channelId: CHANNEL_ID, viewerId: USER_ID, at: NOW }]);
    });
  });

  it.each([
    ["sans identifiant d'installation", {}],
    ["avec un identifiant d'installation qui n'est pas un UUID", { viewerId: "appareil-42" }],
  ])("refuse en 400 un heartbeat anonyme %s, sans rien enregistrer", async (_, body) => {
    await withPresence({}, async (post, recorded) => {
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
    await withPresence({}, async (post, recorded) => {
      const response = await post(presenceOf(), {
        headers: { authorization: `Bearer ${INVALID_TOKEN}` },
        body: JSON.stringify({ viewerId: INSTALLATION_ID }),
      });

      expect(response.status).toBe(401);
      expect(recorded).toEqual([]);
    });
  });

  it("compte dans les viewers de la chaîne le heartbeat dont l'UUID de chaîne est en majuscules", async () => {
    await withPresence({}, async (post, _recorded, _counted, viewersOf) => {
      const response = await post(presenceOf(LETTERED_CHANNEL_ID.toUpperCase()), {
        body: JSON.stringify({ viewerId: INSTALLATION_ID }),
      });

      expect(response.status).toBe(204);
      expect(await viewersOf(LETTERED_CHANNEL_ID)).toBe(1);
    });
  });

  it("refuse en 400 un identifiant de chaîne qui n'est pas un UUID, sans rien enregistrer", async () => {
    await withPresence({}, async (post, recorded) => {
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

const anonymousHeartbeat = (headers: Readonly<Record<string, string>> = {}) => ({
  headers,
  body: JSON.stringify({ viewerId: INSTALLATION_ID }),
});

const repeat = (times: number, send: (index: number) => Promise<Response>) =>
  Array.from({ length: times }, (_, index) => index).reduce<Promise<readonly number[]>>(
    async (previous, index) => [...(await previous), (await send(index)).status],
    Promise.resolve([]),
  );

const makeChannelId = (index: number) =>
  `00000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`;

describe("limite de débit du heartbeat de présence (ADR 0042)", () => {
  it("admet 4 heartbeats par minute d'une même IP sur une chaîne, puis refuse en 429 RFC 9457", async () => {
    await withPresence({}, async (post, recorded) => {
      expect(await repeat(4, () => post(presenceOf(), anonymousHeartbeat()))).toEqual([
        204, 204, 204, 204,
      ]);

      const refused = await post(presenceOf(), anonymousHeartbeat());

      expect(refused.status).toBe(429);
      expect(refused.headers.get("content-type")).toContain("application/problem+json");
      expect(refused.headers.get("retry-after")).toBe("40");
      expect(responses.Problem.parse(await refused.json())).toMatchObject({
        status: 429,
        title: "Trop de requêtes",
      });
      expect(recorded).toHaveLength(4);
    });
  });

  it("limite aussi le heartbeat d'un compte connecté", async () => {
    await withPresence({}, async (post, recorded) => {
      const connected = { headers: { authorization: "Bearer jeton" } };
      await repeat(4, () => post(presenceOf(), connected));

      expect((await post(presenceOf(), connected)).status).toBe(429);
      expect(recorded).toHaveLength(4);
    });
  });

  it("compte le heartbeat par IP et chaîne, et par IP, sur des fenêtres d'une minute", async () => {
    await withPresence({}, async (post, _recorded, counted) => {
      await post(presenceOf(), anonymousHeartbeat());

      const window = Math.floor(NOW.getTime() / 60_000);
      expect(counted).toEqual([
        { key: `ratelimit:presence:channel:127.0.0.1:${CHANNEL_ID}:${window}`, ttlMs: 60_000 },
        { key: `ratelimit:presence:ip:127.0.0.1:${window}`, ttlMs: 60_000 },
      ]);
    });
  });

  it("compte une chaîne écrite en majuscules dans la même limite que la chaîne en minuscules", async () => {
    await withPresence({}, async (post) => {
      await repeat(4, () => post(presenceOf(LETTERED_CHANNEL_ID), anonymousHeartbeat()));

      const upperCase = await post(
        presenceOf(LETTERED_CHANNEL_ID.toUpperCase()),
        anonymousHeartbeat(),
      );

      expect(upperCase.status).toBe(429);
    });
  });

  it("compte chaque chaîne à part pour une même IP", async () => {
    await withPresence({}, async (post) => {
      await repeat(5, () => post(presenceOf(), anonymousHeartbeat()));

      expect((await post(presenceOf(OTHER_CHANNEL_ID), anonymousHeartbeat())).status).toBe(204);
    });
  });

  it("refuse en 429 au-delà de 60 heartbeats par minute d'une même IP, toutes chaînes confondues", async () => {
    await withPresence({}, async (post) => {
      const statuses = await repeat(61, (index) =>
        post(presenceOf(makeChannelId(index % 16)), anonymousHeartbeat()),
      );

      expect(statuses.slice(0, 60).every((status) => status === 204)).toBe(true);
      expect(statuses[60]).toBe(429);
    });
  });

  it("ignore X-Forwarded-For sans proxy de confiance : le client ne s'en sert pas pour changer d'IP", async () => {
    await withPresence({ trustedProxyCount: 0 }, async (post) => {
      const statuses = await repeat(5, () =>
        post(presenceOf(), anonymousHeartbeat({ "x-forwarded-for": `${FORGED_IP}` })),
      );

      expect(statuses.at(-1)).toBe(429);
    });
  });

  it("compte par l'IP qu'ajoute le proxy de confiance", async () => {
    await withPresence({ trustedProxyCount: 1 }, async (post) => {
      await repeat(5, () =>
        post(presenceOf(), anonymousHeartbeat({ "x-forwarded-for": `${FORGED_IP}, ${CLIENT_IP}` })),
      );

      const otherClient = await post(
        presenceOf(),
        anonymousHeartbeat({ "x-forwarded-for": `${CLIENT_IP}, ${FORGED_IP}` }),
      );

      expect(otherClient.status).toBe(204);
    });
  });
});
