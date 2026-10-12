import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import type { AccessTokenIdentity } from "@repo/auth-verifier";
import { err, ok } from "@repo/result";

import type { AccessTokenVerifier } from "../../../platform/authentication.ts";
import { configureApp } from "../../../platform/configure-app.ts";
import { PlatformModule } from "../../../platform/platform.module.ts";
import { GET_CURRENT_ACCOUNT, type GetCurrentAccount, MeController } from "./me.controller.ts";

const USER_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";

const IDENTITY: AccessTokenIdentity = {
  userId: USER_ID,
  sid: "sid-1",
  scopes: [],
  authTime: null,
  amr: [],
  revocation: "checked",
};

const acceptingVerifier: AccessTokenVerifier = { verify: async () => ok(IDENTITY) };

const ACCOUNT = { id: USER_ID, name: "Viewer de test", email: "viewer@twitch.local" };

const withMe = async (
  currentAccount: GetCurrentAccount,
  run: (response: Response) => Promise<void>,
) => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      PlatformModule.register({
        schemaVersionCheck: async () => {},
        logSink: () => {},
        accessTokenVerifier: acceptingVerifier,
      }),
    ],
    controllers: [MeController],
    providers: [{ provide: GET_CURRENT_ACCOUNT, useValue: currentAccount }],
  }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.listen(0, "127.0.0.1");
  try {
    await run(
      await fetch(`${await app.getUrl()}/v1/me`, { headers: { authorization: "Bearer jeton" } }),
    );
  } finally {
    await app.close();
  }
};

describe("GET /v1/me", () => {
  it("rend le compte de l'identité du jeton", async () => {
    await withMe(
      async (userId) => (userId === USER_ID ? ok(ACCOUNT) : err("account_not_found")),
      async (response) => {
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(ACCOUNT);
      },
    );
  });

  it("refuse en 401 un jeton dont le compte n'existe plus", async () => {
    await withMe(
      async () => err("account_not_found"),
      async (response) => {
        expect(response.status).toBe(401);
        expect(response.headers.get("www-authenticate")).toBe('Bearer error="invalid_token"');
      },
    );
  });
});
