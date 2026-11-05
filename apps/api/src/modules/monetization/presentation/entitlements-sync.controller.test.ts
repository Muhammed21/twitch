import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import type { AccessTokenIdentity } from "@repo/auth-verifier";
import { responses } from "@repo/contracts";
import { err, ok } from "@repo/result";

import { buildOpenApiDocument } from "../../../openapi/build-document.ts";
import type { AccessTokenVerifier } from "../../../platform/authentication.ts";
import { configureApp } from "../../../platform/configure-app.ts";
import { PlatformModule } from "../../../platform/platform.module.ts";
import { memoryWindowCounter } from "../../../platform/testing/memory-window-counter.ts";
import type {
  ReadActiveEntitlements,
  SyncTurboEntitlement,
} from "../application/sync-turbo-entitlement.ts";
import { entitlementsSyncRateLimit } from "./entitlements-sync-rate-limit.ts";
import {
  ENTITLEMENTS_SYNC_RATE_LIMIT,
  EntitlementsSyncController,
  READ_ACTIVE_ENTITLEMENTS,
  SYNC_TURBO_ENTITLEMENT,
} from "./entitlements-sync.controller.ts";

const USER_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const INVALID_TOKEN = "jeton-invalide";
const NOW = new Date("2026-11-08T09:00:20.000Z");
const EXPIRES_AT = "2026-12-08T09:00:00.000Z";

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

const turboSubscriber: ReadActiveEntitlements = async (userId) =>
  userId === USER_ID ? [{ scope: "platform", expiresAt: new Date(EXPIRES_AT) }] : [];

const applied: SyncTurboEntitlement = async () => ok("applied");

const createModule = ({
  sync,
  readEntitlements = turboSubscriber,
}: {
  sync: SyncTurboEntitlement | undefined;
  readEntitlements?: ReadActiveEntitlements;
}) =>
  Test.createTestingModule({
    imports: [
      PlatformModule.register({
        schemaVersionCheck: async () => {},
        logSink: () => {},
        accessTokenVerifier: verifier,
      }),
    ],
    controllers: [EntitlementsSyncController],
    providers: [
      { provide: SYNC_TURBO_ENTITLEMENT, useValue: sync },
      { provide: READ_ACTIVE_ENTITLEMENTS, useValue: readEntitlements },
      {
        provide: ENTITLEMENTS_SYNC_RATE_LIMIT,
        useValue: entitlementsSyncRateLimit({
          counter: memoryWindowCounter().counter,
          now: () => NOW,
        }),
      },
    ],
  }).compile();

const withSync = async (
  options: { sync: SyncTurboEntitlement | undefined; readEntitlements?: ReadActiveEntitlements },
  run: (post: (headers?: Readonly<Record<string, string>>) => Promise<Response>) => Promise<void>,
) => {
  const moduleRef = await createModule(options);
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.listen(0, "127.0.0.1");
  const url = await app.getUrl();
  try {
    await run((headers = { authorization: "Bearer jeton" }) =>
      fetch(`${url}/v1/me/entitlements/sync`, { method: "POST", headers }),
    );
  } finally {
    await app.close();
  }
};

describe("POST /v1/me/entitlements/sync (ADR 0051 §2, ADR 0042)", () => {
  it("resynchronise le compte du jeton et rend ses entitlements actifs", async () => {
    const synced: string[] = [];
    const sync: SyncTurboEntitlement = async (userId) => {
      synced.push(userId);
      return ok("applied");
    };

    await withSync({ sync }, async (post) => {
      const response = await post();

      expect(response.status).toBe(200);
      expect(responses.EntitlementList.parse(await response.json())).toEqual({
        entitlements: [{ scope: "platform", expiresAt: EXPIRES_AT }],
      });
      expect(synced).toEqual([USER_ID]);
    });
  });

  it("refuse en 401 une requête sans jeton valide", async () => {
    await withSync({ sync: applied }, async (post) => {
      expect((await post({})).status).toBe(401);
      expect((await post({ authorization: `Bearer ${INVALID_TOKEN}` })).status).toBe(401);
    });
  });

  it("répond 503 RFC 9457 quand RevenueCat ne répond pas", async () => {
    await withSync({ sync: async () => err("unavailable") }, async (post) => {
      const response = await post();

      expect(response.status).toBe(503);
      expect(response.headers.get("content-type")).toContain("application/problem+json");
      expect(await response.json()).toMatchObject({ title: "RevenueCat injoignable" });
    });
  });

  it("répond 503 quand la clé RevenueCat n'est pas configurée", async () => {
    await withSync({ sync: undefined }, async (post) => {
      const response = await post();

      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        title: "Resynchronisation RevenueCat non configurée",
      });
    });
  });

  it("refuse en 429 une resynchronisation trop fréquente, avec Retry-After", async () => {
    const synced: string[] = [];
    const sync: SyncTurboEntitlement = async (userId) => {
      synced.push(userId);
      return ok("applied");
    };

    await withSync({ sync }, async (post) => {
      const statuses = await [...Array(11).keys()].reduce<Promise<number[]>>(
        async (previous) => [...(await previous), (await post()).status],
        Promise.resolve([]),
      );

      expect(statuses).toEqual([...Array(10).fill(200), 429]);
      expect(synced).toHaveLength(10);
      const refused = await post();
      expect(refused.headers.get("retry-after")).toBe("580");
    });
  });

  it("figure dans l'OpenAPI, avec EntitlementList", async () => {
    const app = configureApp((await createModule({ sync: applied })).createNestApplication());
    await app.init();
    try {
      expect(buildOpenApiDocument(app)).toMatchObject({
        paths: {
          "/v1/me/entitlements/sync": {
            post: {
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/EntitlementList" },
                    },
                  },
                },
              },
            },
          },
        },
      });
    } finally {
      await app.close();
    }
  });
});
