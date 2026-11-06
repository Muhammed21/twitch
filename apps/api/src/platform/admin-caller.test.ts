import { Controller, Get, Post, UseGuards } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { exportJWK, generateKeyPair } from "jose";
import { describe, expect, it } from "vitest";

import {
  type AccessTokenIdentity,
  createActingUserVerifier,
  importActingUserPrivateKey,
  importActingUserPublicKey,
  signActingUser,
} from "@repo/auth-verifier";
import { ok } from "@repo/result";

import {
  adminCallerGuard,
  type AdminActor,
  CurrentActor,
  serviceCallersFor,
} from "./admin-caller.ts";
import type { AccessTokenVerifier } from "./authentication.ts";
import { configureApp } from "./configure-app.ts";
import { PlatformModule } from "./platform.module.ts";
import { ProblemException } from "./problem.ts";
import { PAYLOAD_ADMIN_ACCOUNT, type ServiceAccount } from "./service-accounts.ts";

const ADMIN_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const OTHER_ADMIN_ID = "8b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e";
const PAYLOAD_SECRET = "secret-du-compte-de-service-payload-admin";
const NOW = new Date("2026-11-06T12:00:00.000Z");

@Controller("categories-admin")
@UseGuards(adminCallerGuard("admin:category.manage"))
class CategoryAdminProbe {
  @Post()
  act(@CurrentActor() actor: AdminActor) {
    return actor;
  }

  @Post("rejet")
  reject() {
    throw new ProblemException({ status: 400, title: "Requête invalide" });
  }
}

@Controller("bans-admin")
@UseGuards(adminCallerGuard("admin:user.ban"))
class BanAdminProbe {
  @Get()
  act(@CurrentActor() actor: AdminActor) {
    return actor;
  }
}

const keyPair = async () => {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA", {
    crv: "Ed25519",
    extractable: true,
  });
  return {
    publicKey: await importActingUserPublicKey(JSON.stringify(await exportJWK(publicKey))),
    privateKey: await importActingUserPrivateKey(JSON.stringify(await exportJWK(privateKey))),
  };
};

const PAYLOAD_KEYS = await keyPair();
const OTHER_KEYS = await keyPair();

const makePayloadAccount = (overrides: Partial<ServiceAccount> = {}): ServiceAccount => ({
  ...PAYLOAD_ADMIN_ACCOUNT,
  secret: PAYLOAD_SECRET,
  ...overrides,
});

const userVerifier = (scopes: readonly string[]): AccessTokenVerifier => ({
  verify: async () =>
    ok<AccessTokenIdentity>({
      userId: ADMIN_ID,
      sid: "sid-1",
      scopes,
      authTime: null,
      amr: [],
      revocation: "checked",
    }),
});

type LogLine = Record<string, unknown>;

const withApp = async (
  {
    accounts = [makePayloadAccount()],
    userScopes = ["admin:category.manage"],
  }: { accounts?: readonly ServiceAccount[]; userScopes?: readonly string[] },
  run: (
    request: (path: string, headers: Record<string, string>) => Promise<Response>,
    logs: readonly LogLine[],
  ) => Promise<void>,
) => {
  const logs: LogLine[] = [];
  const moduleRef = await Test.createTestingModule({
    imports: [
      PlatformModule.register({
        schemaVersionCheck: async () => {},
        logSink: (line) => {
          logs.push(JSON.parse(line));
        },
        accessTokenVerifier: userVerifier(userScopes),
        serviceCallers: {
          accounts,
          actingUser: createActingUserVerifier({ publicKey: PAYLOAD_KEYS.publicKey }),
          now: () => NOW,
        },
      }),
    ],
    controllers: [CategoryAdminProbe, BanAdminProbe],
  }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.listen(0, "127.0.0.1");
  const url = await app.getUrl();
  try {
    await run(
      (path, headers) =>
        fetch(`${url}/v1/${path}`, {
          method: path.startsWith("categories-admin") ? "POST" : "GET",
          headers,
        }),
      logs,
    );
  } finally {
    await app.close();
  }
};

const actingUser = async ({
  userId = ADMIN_ID,
  privateKey = PAYLOAD_KEYS.privateKey,
  signedAt = NOW,
}: { userId?: string; privateKey?: CryptoKey; signedAt?: Date } = {}) =>
  signActingUser({ userId, privateKey, now: signedAt });

const fromPayload = (actingUserHeader?: string) => ({
  authorization: `Service ${PAYLOAD_SECRET}`,
  ...(actingUserHeader === undefined ? {} : { "x-acting-user": actingUserHeader }),
});

const triplets = (logs: readonly LogLine[]) =>
  logs.filter((line) => line["msg"] === "admin.acting_user");

describe("appel d'administration par le compte de service de Payload (ADR 0007)", () => {
  it("agit au nom de l'humain signé dans X-Acting-User, pour le compte de service", async () => {
    await withApp({}, async (request) => {
      const response = await request("categories-admin", fromPayload(await actingUser()));

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({
        actorId: ADMIN_ID,
        onBehalfOf: "svc:payload-admin",
        source: "payload",
      });
    });
  });

  it("refuse en 403 un appel sans X-Acting-User", async () => {
    await withApp({}, async (request) => {
      const response = await request("categories-admin", fromPayload());

      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ status: 403, title: "Action non autorisée" });
    });
  });

  it("refuse en 403 un X-Acting-User expiré", async () => {
    const expired = await actingUser({ signedAt: new Date(NOW.getTime() - 61_000) });

    await withApp({}, async (request) => {
      expect((await request("categories-admin", fromPayload(expired))).status).toBe(403);
    });
  });

  it("refuse en 403 un X-Acting-User signé par une autre clé que celle de Payload", async () => {
    const forged = await actingUser({ privateKey: OTHER_KEYS.privateKey });

    await withApp({}, async (request) => {
      expect((await request("categories-admin", fromPayload(forged))).status).toBe(403);
    });
  });

  it("refuse en 403 un X-Acting-User illisible", async () => {
    await withApp({}, async (request) => {
      expect((await request("categories-admin", fromPayload("pas-un-jwt"))).status).toBe(403);
    });
  });

  it("refuse en 403 quand le compte de service n'a pas le scope, même avec un humain", async () => {
    await withApp({}, async (request) => {
      const response = await request("bans-admin", fromPayload(await actingUser()));

      expect(response.status).toBe(403);
    });
  });

  it("refuse en 403 quand le scope a été retiré du compte de service", async () => {
    await withApp({ accounts: [makePayloadAccount({ scopes: [] })] }, async (request) => {
      const response = await request("categories-admin", fromPayload(await actingUser()));

      expect(response.status).toBe(403);
    });
  });

  it("refuse en 401 un secret de compte de service inconnu", async () => {
    await withApp({}, async (request) => {
      const response = await request("categories-admin", {
        authorization: `Service ${PAYLOAD_SECRET}-faux`,
        "x-acting-user": await actingUser(),
      });

      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe("Service");
      expect(await response.json()).toMatchObject({ title: "Authentification requise" });
    });
  });

  it.each([
    ["un schéma préfixé", `XService ${PAYLOAD_SECRET}`],
    ["deux valeurs", `Service ${PAYLOAD_SECRET} autre`],
  ])("ne reconnaît pas le compte de service dans %s", async (_case, authorization) => {
    await withApp({}, async (request) => {
      const response = await request("categories-admin", {
        authorization,
        "x-acting-user": await actingUser(),
      });

      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe("Bearer");
    });
  });

  it("refuse en 401 le secret de Payload quand aucun compte de service n'est configuré", async () => {
    await withApp({ accounts: [] }, async (request) => {
      const response = await request("categories-admin", fromPayload(await actingUser()));

      expect(response.status).toBe(401);
    });
  });

  it("journalise l'humain, le compte de service et l'action d'un appel accepté", async () => {
    await withApp({}, async (request, logs) => {
      await request("categories-admin", fromPayload(await actingUser()));

      expect(triplets(logs)).toEqual([
        expect.objectContaining({
          level: "info",
          actorId: ADMIN_ID,
          onBehalfOf: "svc:payload-admin",
          scope: "admin:category.manage",
          method: "POST",
          path: "/v1/categories-admin",
          status: 201,
          outcome: "allowed",
        }),
      ]);
    });
  });

  it("journalise comme refusé un appel accepté par la garde puis rejeté par la route", async () => {
    await withApp({}, async (request, logs) => {
      await request("categories-admin/rejet", fromPayload(await actingUser()));

      expect(triplets(logs)).toEqual([
        expect.objectContaining({ actorId: ADMIN_ID, status: 400, outcome: "refused" }),
      ]);
    });
  });

  it("journalise le triplet d'un appel refusé faute de scope", async () => {
    await withApp({}, async (request, logs) => {
      await request("bans-admin", fromPayload(await actingUser({ userId: OTHER_ADMIN_ID })));

      expect(triplets(logs)).toEqual([
        expect.objectContaining({
          actorId: OTHER_ADMIN_ID,
          onBehalfOf: "svc:payload-admin",
          scope: "admin:user.ban",
          status: 403,
          outcome: "refused",
          reason: "missing_scope",
        }),
      ]);
    });
  });

  it.each([
    ["absent", undefined, "missing_acting_user"],
    ["illisible", "pas-un-jwt", "invalid"],
  ])(
    "journalise un appel refusé dont l'humain est %s, sans humain",
    async (_case, header, reason) => {
      await withApp({}, async (request, logs) => {
        await request("categories-admin", fromPayload(header));

        expect(triplets(logs)).toEqual([
          expect.objectContaining({
            actorId: null,
            onBehalfOf: "svc:payload-admin",
            status: 403,
            outcome: "refused",
            reason,
          }),
        ]);
      });
    },
  );
});

describe("appel d'administration par un jeton d'accès utilisateur", () => {
  it("agit au nom du titulaire du jeton, sans compte de service", async () => {
    await withApp({}, async (request) => {
      const response = await request("categories-admin", { authorization: "Bearer jeton" });

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({
        actorId: ADMIN_ID,
        onBehalfOf: null,
        source: "api",
      });
    });
  });

  it("refuse en 403 un jeton sans le scope", async () => {
    await withApp({ userScopes: ["openid"] }, async (request) => {
      expect((await request("categories-admin", { authorization: "Bearer jeton" })).status).toBe(
        403,
      );
    });
  });

  it("refuse en 401 un appel sans aucune authentification", async () => {
    await withApp({}, async (request) => {
      expect((await request("categories-admin", {})).status).toBe(401);
    });
  });

  it("ignore X-Acting-User sur un jeton d'utilisateur", async () => {
    await withApp({}, async (request, logs) => {
      const response = await request("categories-admin", {
        authorization: "Bearer jeton",
        "x-acting-user": await actingUser({ userId: OTHER_ADMIN_ID }),
      });

      expect(await response.json()).toMatchObject({ actorId: ADMIN_ID, onBehalfOf: null });
      expect(triplets(logs)).toEqual([]);
    });
  });
});

describe("comptes de service configurés au démarrage", () => {
  it("n'accepte aucun compte de service quand Payload n'est pas configuré", async () => {
    expect((await serviceCallersFor(undefined)).accounts).toEqual([]);
  });

  it("déclare svc:payload-admin avec le seul scope admin:category.manage, jamais *", async () => {
    const publicJwk = JSON.stringify(
      await exportJWK((await generateKeyPair("EdDSA", { crv: "Ed25519" })).publicKey),
    );

    expect(
      (
        await serviceCallersFor({
          serviceSecret: PAYLOAD_SECRET,
          actingUserPublicKey: publicJwk,
        })
      ).accounts,
    ).toEqual([
      { id: "svc:payload-admin", scopes: ["admin:category.manage"], secret: PAYLOAD_SECRET },
    ]);
  });

  it("vérifie X-Acting-User avec la clé publique configurée, à l'heure courante", async () => {
    const keys = await keyPair();
    const callers = await serviceCallersFor({
      serviceSecret: PAYLOAD_SECRET,
      actingUserPublicKey: JSON.stringify(await exportJWK(keys.publicKey)),
    });
    const header = await signActingUser({
      userId: ADMIN_ID,
      privateKey: keys.privateKey,
      now: new Date(),
    });

    expect(await callers.actingUser.verify(header, callers.now())).toEqual({
      ok: true,
      value: { userId: ADMIN_ID },
    });
  });

  it("refuse de démarrer avec une clé de X-Acting-User illisible", async () => {
    await expect(
      serviceCallersFor({ serviceSecret: PAYLOAD_SECRET, actingUserPublicKey: "pas-une-clé" }),
    ).rejects.toThrow("Clé X-Acting-User attendue en JWK Ed25519");
  });
});
