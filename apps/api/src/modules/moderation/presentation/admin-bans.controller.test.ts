import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import { err, ok } from "@repo/result";

import type { ServiceCallers } from "../../../platform/admin-caller.ts";
import type { AccessTokenVerifier } from "../../../platform/authentication.ts";
import { configureApp } from "../../../platform/configure-app.ts";
import { PlatformModule } from "../../../platform/platform.module.ts";
import { PAYLOAD_ADMIN_ACCOUNT, type ServiceAccount } from "../../../platform/service-accounts.ts";
import type { BanRequest } from "../application/ban-user.ts";
import { AdminBansController, BAN_USER, type BanUser } from "./admin-bans.controller.ts";

const HUMAN_ID = "8b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e";
const CHANNEL_ID = "9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69";
const VIEWER_ID = "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e";
const PAYLOAD_SECRET = "secret-du-compte-de-service-payload-admin";

const PAYLOAD_ACCOUNT: ServiceAccount = { ...PAYLOAD_ADMIN_ACCOUNT, secret: PAYLOAD_SECRET };

const callersWith = (account: ServiceAccount): ServiceCallers => ({
  accounts: [account],
  actingUser: {
    verify: async (header) =>
      header.startsWith("humain:") ? ok({ userId: header.slice(7) }) : err("invalid"),
  },
  now: () => new Date(),
});

const refusingVerifier: AccessTokenVerifier = { verify: async () => err("invalid_token") };

const BANNED = ok({
  channelId: CHANNEL_ID,
  userId: VIEWER_ID,
  expiresAt: new Date("2026-11-06T13:00:00.000Z"),
  reason: "Harcèlement",
  cacheInvalidated: true,
});

const withBans = async (
  {
    answer = BANNED,
    account = PAYLOAD_ACCOUNT,
  }: { answer?: Awaited<ReturnType<BanUser>>; account?: ServiceAccount },
  run: (base: string, requests: BanRequest[]) => Promise<void>,
) => {
  const requests: BanRequest[] = [];
  const moduleRef = await Test.createTestingModule({
    imports: [
      PlatformModule.register({
        schemaVersionCheck: async () => {},
        logSink: () => {},
        accessTokenVerifier: refusingVerifier,
        serviceCallers: callersWith(account),
      }),
    ],
    controllers: [AdminBansController],
    providers: [
      {
        provide: BAN_USER,
        useValue: async (request: BanRequest) => {
          requests.push(request);
          return answer;
        },
      },
    ],
  }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.listen(0, "127.0.0.1");
  try {
    await run(`${await app.getUrl()}/v1/admin/channels`, requests);
  } finally {
    await app.close();
  }
};

const postBan = (
  base: string,
  {
    channel = CHANNEL_ID,
    body = { userId: VIEWER_ID, durationMinutes: 60, reason: "Harcèlement" },
    actingUser = `humain:${HUMAN_ID}`,
  }: { channel?: string; body?: unknown; actingUser?: string | null } = {},
) =>
  fetch(`${base}/${channel}/bans`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Service ${PAYLOAD_SECRET}`,
      ...(actingUser === null ? {} : { "x-acting-user": actingUser }),
    },
    body: JSON.stringify(body),
  });

describe("bannissement depuis l'administration (POST /v1/admin/channels/:id/bans)", () => {
  it("transmet la demande au nom de l'humain, via le compte de service, et rend le ban", async () => {
    await withBans({}, async (base, requests) => {
      const response = await postBan(base);

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({
        channelId: CHANNEL_ID,
        userId: VIEWER_ID,
        expiresAt: "2026-11-06T13:00:00.000Z",
        reason: "Harcèlement",
      });
      expect(requests).toEqual([
        {
          actor: { actorId: HUMAN_ID, onBehalfOf: "svc:payload-admin", source: "payload" },
          channelId: CHANNEL_ID,
          targetId: VIEWER_ID,
          durationMinutes: 60,
          reason: "Harcèlement",
        },
      ]);
    });
  });

  it("transmet un ban définitif sans durée, et le rend sans fin", async () => {
    await withBans({ answer: ok({ ...BANNED.value, expiresAt: null }) }, async (base, requests) => {
      const response = await postBan(base, {
        body: { userId: VIEWER_ID, reason: "Harcèlement" },
      });

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({
        channelId: CHANNEL_ID,
        userId: VIEWER_ID,
        reason: "Harcèlement",
      });
      expect(requests.map((request) => request.durationMinutes)).toEqual([null]);
    });
  });

  it("refuse en 403 un compte de service sans le scope admin:user.ban, sans appeler le use-case", async () => {
    await withBans(
      { account: { ...PAYLOAD_ACCOUNT, scopes: ["admin:category.manage"] } },
      async (base, requests) => {
        expect((await postBan(base)).status).toBe(403);
        expect(requests).toEqual([]);
      },
    );
  });

  it("refuse en 403 un appel sans humain, sans appeler le use-case", async () => {
    await withBans({}, async (base, requests) => {
      expect((await postBan(base, { actingUser: null })).status).toBe(403);
      expect(requests).toEqual([]);
    });
  });

  it.each([
    ["forbidden", 403, { title: "Action non autorisée" }],
    [
      "invalid_duration",
      422,
      {
        title: "Durée invalide",
        detail: "Un bannissement dure de 1 à 525600 minutes, ou il est définitif.",
      },
    ],
    [
      "invalid_reason",
      422,
      { title: "Motif invalide", detail: "Un motif compte de 1 à 500 caractères." },
    ],
  ] as const)("traduit le refus %s du use-case en %i", async (error, status, problem) => {
    await withBans({ answer: err(error) }, async (base) => {
      const response = await postBan(base);

      expect(response.status).toBe(status);
      expect(response.headers.get("content-type")).toContain("application/problem+json");
      expect(await response.json()).toMatchObject({ status, ...problem });
    });
  });

  it("répond 404 pour une chaîne qui n'est pas un identifiant, sans appeler le use-case", async () => {
    await withBans({}, async (base, requests) => {
      const response = await postBan(base, { channel: "chaine-1" });

      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ title: "Chaîne introuvable" });
      expect(requests).toEqual([]);
    });
  });

  it.each([
    ["sans utilisateur", { durationMinutes: 60, reason: "spam" }],
    ["sans motif", { userId: VIEWER_ID, durationMinutes: 60 }],
    [
      "avec une durée qui n'est pas un entier",
      { userId: VIEWER_ID, durationMinutes: "1h", reason: "spam" },
    ],
    ["avec une durée nulle", { userId: VIEWER_ID, durationMinutes: null, reason: "spam" }],
    ["avec un champ inconnu", { userId: VIEWER_ID, reason: "spam", permanent: true }],
  ])("refuse en 400 un corps %s", async (_name, body) => {
    await withBans({}, async (base, requests) => {
      expect((await postBan(base, { body })).status).toBe(400);
      expect(requests).toEqual([]);
    });
  });
});
