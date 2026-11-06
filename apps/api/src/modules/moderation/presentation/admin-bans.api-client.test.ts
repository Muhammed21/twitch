import { Test } from "@nestjs/testing";
import { exportJWK, generateKeyPair } from "jose";
import { describe, expect, it } from "vitest";

import { type ApiClient, createApiClient, importActingUserPrivateKey } from "@repo/api-client";
import { err, ok } from "@repo/result";

import { serviceCallersFor } from "../../../platform/admin-caller.ts";
import { rejectingVerifier } from "../../../platform/authentication.ts";
import { configureApp } from "../../../platform/configure-app.ts";
import { PlatformModule } from "../../../platform/platform.module.ts";
import type { BanRequest } from "../application/ban-user.ts";
import { AdminBansController, BAN_USER, type BanUser } from "./admin-bans.controller.ts";

const HUMAN_ID = "8b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e";
const CHANNEL_ID = "9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69";
const VIEWER_ID = "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e";
const SERVICE_SECRET = "secret-du-compte-de-service-payload-admin";

const keys = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
const PUBLIC_JWK = JSON.stringify(await exportJWK(keys.publicKey));
const PRIVATE_JWK = JSON.stringify(await exportJWK(keys.privateKey));

const withApi = async (
  answer: Awaited<ReturnType<BanUser>>,
  run: (client: ApiClient, requests: BanRequest[]) => Promise<void>,
) => {
  const requests: BanRequest[] = [];
  const moduleRef = await Test.createTestingModule({
    imports: [
      PlatformModule.register({
        schemaVersionCheck: async () => {},
        logSink: () => {},
        accessTokenVerifier: rejectingVerifier,
        serviceCallers: await serviceCallersFor({
          serviceSecret: SERVICE_SECRET,
          actingUserPublicKey: PUBLIC_JWK,
        }),
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
    const client = createApiClient({
      baseUrl: await app.getUrl(),
      serviceSecret: SERVICE_SECRET,
      actingUserPrivateKey: await importActingUserPrivateKey(PRIVATE_JWK),
    });
    await run(client, requests);
  } finally {
    await app.close();
  }
};

const banFor = (durationMinutes: number | null) => ({
  actingUserId: HUMAN_ID,
  channelId: CHANNEL_ID,
  targetId: VIEWER_ID,
  durationMinutes,
  reason: "Harcèlement",
});

describe("@repo/api-client contre la route de bannissement (ADR 0007)", () => {
  it.each([
    ["pour une heure", 60, new Date("2026-11-06T13:00:00.000Z")],
    ["définitivement", null, null],
  ] as const)(
    "bannit %s au nom de l'humain, pour le compte de service",
    async (_case, durationMinutes, expiresAt) => {
      const answer = ok({
        channelId: CHANNEL_ID,
        userId: VIEWER_ID,
        expiresAt,
        reason: "Harcèlement",
        cacheInvalidated: true,
      });

      await withApi(answer, async (client, requests) => {
        expect(await client.moderation.banUser(banFor(durationMinutes))).toEqual({
          ok: true,
          value: {
            channelId: CHANNEL_ID,
            userId: VIEWER_ID,
            reason: "Harcèlement",
            ...(expiresAt === null ? {} : { expiresAt: expiresAt.toISOString() }),
          },
        });
        expect(requests).toEqual([
          {
            actor: { actorId: HUMAN_ID, onBehalfOf: "svc:payload-admin", source: "payload" },
            channelId: CHANNEL_ID,
            targetId: VIEWER_ID,
            durationMinutes,
            reason: "Harcèlement",
          },
        ]);
      });
    },
  );

  it("rend le refus de l'humain sans le droit comme un échec 403", async () => {
    await withApi(err("forbidden"), async (client) => {
      expect(await client.moderation.banUser(banFor(60))).toMatchObject({
        ok: false,
        error: { kind: "problem", problem: { status: 403, title: "Action non autorisée" } },
      });
    });
  });
});
