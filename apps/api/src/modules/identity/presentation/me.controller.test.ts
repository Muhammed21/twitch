import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import type { AccessTokenIdentity } from "@repo/auth-verifier";
import { err, ok } from "@repo/result";

import { buildOpenApiDocument } from "../../../openapi/build-document.ts";
import type { AccessTokenVerifier } from "../../../platform/authentication.ts";
import { configureApp } from "../../../platform/configure-app.ts";
import { PlatformModule } from "../../../platform/platform.module.ts";
import {
  CHANGE_BIO,
  type ChangeBio,
  GET_CURRENT_ACCOUNT,
  type GetCurrentAccount,
  MeController,
} from "./me.controller.ts";

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

const accountOf =
  (account: typeof ACCOUNT): GetCurrentAccount =>
  async (userId) =>
    userId === account.id ? ok(account) : err("account_not_found");

const withMe = async (
  {
    currentAccount = accountOf(ACCOUNT),
    changeBio = async () => ok(undefined),
  }: { currentAccount?: GetCurrentAccount; changeBio?: ChangeBio },
  run: (
    base: string,
    bioChanges: Parameters<ChangeBio>[0][],
    openApi: ReturnType<typeof buildOpenApiDocument>,
  ) => Promise<void>,
) => {
  const bioChanges: Parameters<ChangeBio>[0][] = [];
  const moduleRef = await Test.createTestingModule({
    imports: [
      PlatformModule.register({
        schemaVersionCheck: async () => {},
        logSink: () => {},
        accessTokenVerifier: acceptingVerifier,
      }),
    ],
    controllers: [MeController],
    providers: [
      { provide: GET_CURRENT_ACCOUNT, useValue: currentAccount },
      {
        provide: CHANGE_BIO,
        useValue: (change: Parameters<ChangeBio>[0]) => {
          bioChanges.push(change);
          return changeBio(change);
        },
      },
    ],
  }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.listen(0, "127.0.0.1");
  try {
    await run(`${await app.getUrl()}/v1/me`, bioChanges, buildOpenApiDocument(app));
  } finally {
    await app.close();
  }
};

const get = (url: string) => fetch(url, { headers: { authorization: "Bearer jeton" } });

const patch = (url: string, body: unknown) =>
  fetch(url, {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: "Bearer jeton" },
    body: JSON.stringify(body),
  });

describe("GET /v1/me", () => {
  it("rend le compte de l'identité du jeton", async () => {
    await withMe({}, async (base) => {
      const response = await get(base);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(ACCOUNT);
    });
  });

  it("rend la bio et le début du dernier live en date ISO", async () => {
    const currentAccount: GetCurrentAccount = async () =>
      ok({ ...ACCOUNT, bio: "Speedrun", lastLiveAt: new Date("2026-11-03T20:15:00.000Z") });

    await withMe({ currentAccount }, async (base) => {
      expect(await (await get(base)).json()).toEqual({
        ...ACCOUNT,
        bio: "Speedrun",
        lastLiveAt: "2026-11-03T20:15:00.000Z",
      });
    });
  });

  it("refuse en 401 un jeton dont le compte n'existe plus", async () => {
    await withMe({ currentAccount: async () => err("account_not_found") }, async (base) => {
      const response = await get(base);

      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe('Bearer error="invalid_token"');
    });
  });
});

describe("PATCH /v1/me", () => {
  it("change la bio de l'identité du jeton et rend le compte relu", async () => {
    const currentAccount: GetCurrentAccount = async () => ok({ ...ACCOUNT, bio: "Speedrun" });

    await withMe({ currentAccount }, async (base, bioChanges) => {
      const response = await patch(base, { bio: "Speedrun" });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ...ACCOUNT, bio: "Speedrun" });
      expect(bioChanges).toEqual([{ userId: USER_ID, bio: "Speedrun" }]);
    });
  });

  it("répond 422 pour une bio trop longue", async () => {
    await withMe({ changeBio: async () => err("bio_too_long") }, async (base) => {
      const response = await patch(base, { bio: "a".repeat(301) });

      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({
        status: 422,
        title: "Bio invalide",
        detail: "La bio compte au plus 300 caractères.",
      });
    });
  });

  it("refuse en 401 un jeton dont le compte n'existe plus", async () => {
    await withMe({ changeBio: async () => err("account_not_found") }, async (base) => {
      const response = await patch(base, { bio: "Speedrun" });

      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe('Bearer error="invalid_token"');
    });
  });

  it("refuse en 401 un compte supprimé entre la modification et la relecture", async () => {
    await withMe({ currentAccount: async () => err("account_not_found") }, async (base) => {
      expect((await patch(base, { bio: "Speedrun" })).status).toBe(401);
    });
  });

  it.each([
    ["sans bio", {}],
    ["avec une bio qui n'est pas un texte", { bio: 42 }],
    ["avec un champ inconnu", { bio: "Speedrun", name: "autre" }],
  ])("répond 400 à un corps %s", async (_name, body) => {
    await withMe({}, async (base, bioChanges) => {
      const response = await patch(base, body);

      expect(response.status).toBe(400);
      expect(bioChanges).toEqual([]);
    });
  });
});

describe("contrat OpenAPI de /v1/me", () => {
  it("documente le corps de PATCH et la limite de la bio", async () => {
    await withMe({}, async (_base, _bioChanges, openApi) => {
      expect(openApi).toMatchObject({
        paths: {
          "/v1/me": {
            patch: {
              requestBody: {
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/UpdateMeRequest" },
                  },
                },
              },
              responses: {
                200: {
                  content: { "application/json": { schema: { $ref: "#/components/schemas/Me" } } },
                },
              },
            },
          },
        },
        components: {
          schemas: {
            UpdateMeRequest: {
              required: ["bio"],
              additionalProperties: false,
              properties: {
                bio: {
                  type: "string",
                  description:
                    "Au plus 300 caractères, espaces des bords retirés ; une bio vide efface la bio.",
                },
              },
            },
          },
        },
      });
    });
  });
});
