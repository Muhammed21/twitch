import { Controller, Get, UseGuards } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import type { AccessTokenIdentity } from "@repo/auth-verifier";
import { err, ok } from "@repo/result";

import {
  AccessTokenGuard,
  type AccessTokenVerifier,
  CurrentIdentity,
  rejectingVerifier,
  requiredScopeGuard,
} from "./authentication.ts";
import { configureApp } from "./configure-app.ts";
import { PlatformModule } from "./platform.module.ts";

const IDENTITY: AccessTokenIdentity = {
  userId: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
  sid: "sid-1",
  scopes: ["openid"],
  authTime: new Date("2026-10-12T12:00:00.000Z"),
  amr: ["pwd"],
  revocation: "checked",
};

@Controller("private")
@UseGuards(AccessTokenGuard)
class PrivateController {
  @Get()
  read(@CurrentIdentity() identity: AccessTokenIdentity) {
    return { userId: identity.userId };
  }
}

@Controller("scoped")
@UseGuards(AccessTokenGuard, requiredScopeGuard("openid"))
class ScopedController {
  @Get()
  read() {
    return {};
  }
}

@Controller("admin-only")
@UseGuards(AccessTokenGuard, requiredScopeGuard("admin:category.manage"))
class AdminOnlyController {
  @Get()
  read() {
    return {};
  }
}

@Controller("scope-without-token")
@UseGuards(requiredScopeGuard("openid"))
class ScopeWithoutTokenController {
  @Get()
  read() {
    return {};
  }
}

const VALID_TOKEN = "jeton-valide";

const fakeVerifier: AccessTokenVerifier = {
  verify: async (token) => {
    if (token === VALID_TOKEN) {
      return ok(IDENTITY);
    }
    return err(token === "jeton-revoque" ? "revoked" : "invalid_token");
  },
};

const withApp = async (
  run: (request: (init?: RequestInit, path?: string) => Promise<Response>) => Promise<void>,
) => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      PlatformModule.register({
        schemaVersionCheck: async () => {},
        logSink: () => {},
        accessTokenVerifier: fakeVerifier,
      }),
    ],
    controllers: [
      PrivateController,
      ScopedController,
      AdminOnlyController,
      ScopeWithoutTokenController,
    ],
  }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.listen(0, "127.0.0.1");
  const url = await app.getUrl();
  try {
    await run((init, path = "private") => fetch(`${url}/v1/${path}`, init));
  } finally {
    await app.close();
  }
};

const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

describe("garde des jetons d'accès (ADR 0005, RFC 6750)", () => {
  it("laisse passer un jeton valide et donne son identité à la route", async () => {
    await withApp(async (request) => {
      const response = await request(bearer(VALID_TOKEN));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ userId: IDENTITY.userId });
    });
  });

  it("refuse une requête sans jeton, en 401 problem+json, avec un défi Bearer sans erreur", async () => {
    await withApp(async (request) => {
      const response = await request();

      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe("Bearer");
      expect(response.headers.get("content-type")).toMatch(/^application\/problem\+json/);
      expect(await response.json()).toMatchObject({
        status: 401,
        title: "Authentification requise",
      });
    });
  });

  it.each([
    ["un jeton invalide", bearer("jeton-faux")],
    ["un jeton révoqué", bearer("jeton-revoque")],
  ])("refuse %s, avec l'erreur invalid_token", async (_case, init) => {
    await withApp(async (request) => {
      const response = await request(init);

      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe('Bearer error="invalid_token"');
    });
  });

  it.each([
    ["un autre schéma", { headers: { authorization: `Basic ${VALID_TOKEN}` } }],
    ["un Bearer vide", { headers: { authorization: "Bearer " } }],
    ["un Bearer sans espace", { headers: { authorization: `Bearer${VALID_TOKEN}` } }],
    ["un schéma préfixé", { headers: { authorization: `XBearer ${VALID_TOKEN}` } }],
    ["deux jetons", { headers: { authorization: `Bearer ${VALID_TOKEN} autre` } }],
  ])("traite %s comme une requête sans jeton", async (_case, init) => {
    await withApp(async (request) => {
      const response = await request(init);

      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe("Bearer");
    });
  });

  it("accepte le schéma Bearer quelle que soit sa casse (RFC 9110)", async () => {
    await withApp(async (request) => {
      const response = await request({ headers: { authorization: `bearer ${VALID_TOKEN}` } });

      expect(response.status).toBe(200);
    });
  });
});

describe("garde d'un scope du jeton (ADR 0007, ADR 0045)", () => {
  it("laisse passer un jeton qui porte le scope", async () => {
    await withApp(async (request) => {
      const response = await request(bearer(VALID_TOKEN), "scoped");

      expect(response.status).toBe(200);
    });
  });

  it("refuse en 403 un jeton valide qui ne porte pas le scope", async () => {
    await withApp(async (request) => {
      const response = await request(bearer(VALID_TOKEN), "admin-only");

      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ status: 403, title: "Action non autorisée" });
    });
  });

  it("refuse en 403 une route dont aucune garde n'a établi l'identité", async () => {
    await withApp(async (request) => {
      const response = await request(bearer(VALID_TOKEN), "scope-without-token");

      expect(response.status).toBe(403);
    });
  });
});

describe("vérificateur qui refuse tout", () => {
  it("refuse n'importe quel jeton comme invalide", async () => {
    expect(await rejectingVerifier.verify(VALID_TOKEN)).toEqual({
      ok: false,
      error: "invalid_token",
    });
  });
});
