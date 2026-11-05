import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import type { AccessTokenIdentity } from "@repo/auth-verifier";
import { err, ok } from "@repo/result";

import { buildOpenApiDocument } from "../../../openapi/build-document.ts";
import type { AccessTokenVerifier } from "../../../platform/authentication.ts";
import { configureApp } from "../../../platform/configure-app.ts";
import { PlatformModule } from "../../../platform/platform.module.ts";
import {
  CHANGE_AVATAR,
  CHANGE_BIO,
  CHANGE_CHAT_COLOR,
  type ChangeAvatar,
  type ChangeBio,
  type ChangeChatColor,
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
    changeAvatar = async () => ok(undefined),
    changeChatColor = async () => ok(undefined),
  }: {
    currentAccount?: GetCurrentAccount;
    changeBio?: ChangeBio;
    changeAvatar?: ChangeAvatar;
    changeChatColor?: ChangeChatColor;
  },
  run: (
    base: string,
    bioChanges: Parameters<ChangeBio>[0][],
    openApi: ReturnType<typeof buildOpenApiDocument>,
    avatarChanges: Parameters<ChangeAvatar>[0][],
    chatColorChanges: Parameters<ChangeChatColor>[0][],
  ) => Promise<void>,
) => {
  const bioChanges: Parameters<ChangeBio>[0][] = [];
  const avatarChanges: Parameters<ChangeAvatar>[0][] = [];
  const chatColorChanges: Parameters<ChangeChatColor>[0][] = [];
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
      {
        provide: CHANGE_AVATAR,
        useValue: (change: Parameters<ChangeAvatar>[0]) => {
          avatarChanges.push(change);
          return changeAvatar(change);
        },
      },
      {
        provide: CHANGE_CHAT_COLOR,
        useValue: (change: Parameters<ChangeChatColor>[0]) => {
          chatColorChanges.push(change);
          return changeChatColor(change);
        },
      },
    ],
  }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.listen(0, "127.0.0.1");
  try {
    await run(
      `${await app.getUrl()}/v1/me`,
      bioChanges,
      buildOpenApiDocument(app),
      avatarChanges,
      chatColorChanges,
    );
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

const put = (url: string, body: unknown) =>
  fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: "Bearer jeton" },
    body: JSON.stringify(body),
  });

const AVATAR_URL =
  "https://images.twitch.example/images/avatar/1f0e8d2c-3b4a-4c5d-8e6f-7a8b9c0d1e2f.webp";
const UPLOAD_ID = "0b6e7a52-2f4e-4c55-9f0e-6a1d2c3b4a59";

describe("avatar dans GET /v1/me", () => {
  it("rend l'URL publique de l'avatar", async () => {
    const currentAccount: GetCurrentAccount = async () => ok({ ...ACCOUNT, avatarUrl: AVATAR_URL });

    await withMe({ currentAccount }, async (base) => {
      expect(await (await get(base)).json()).toStrictEqual({ ...ACCOUNT, avatarUrl: AVATAR_URL });
    });
  });
});

describe("bannière dans GET /v1/me", () => {
  it("rend l'URL publique de la bannière de la chaîne du compte", async () => {
    const bannerUrl = "https://images.twitch.example/images/banner/b.webp";
    const currentAccount: GetCurrentAccount = async () => ok({ ...ACCOUNT, bannerUrl });

    await withMe({ currentAccount }, async (base) => {
      expect(await (await get(base)).json()).toStrictEqual({ ...ACCOUNT, bannerUrl });
    });
  });
});

describe("PUT /v1/me/avatar", () => {
  it("confirme l'envoi en avatar de l'identité du jeton et rend le compte relu", async () => {
    const currentAccount: GetCurrentAccount = async () => ok({ ...ACCOUNT, avatarUrl: AVATAR_URL });

    await withMe({ currentAccount }, async (base, _bioChanges, _openApi, avatarChanges) => {
      const response = await put(`${base}/avatar`, { uploadId: UPLOAD_ID });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ...ACCOUNT, avatarUrl: AVATAR_URL });
      expect(avatarChanges).toEqual([{ userId: USER_ID, uploadId: UPLOAD_ID }]);
    });
  });

  it.each([
    [
      "upload_not_found",
      "Envoi introuvable",
      "Préparez un nouvel envoi : celui-ci n'existe pas ou a expiré.",
    ],
    ["too_large", "Image trop lourde", "Une image d'avatar pèse au plus 10 Mio."],
    ["unsupported_type", "Type d'image refusé", "Envoyez une image JPEG, PNG ou WebP."],
    ["too_small", "Image trop petite", "Une image d'avatar mesure au moins 256 × 256 pixels."],
    ["too_many_pixels", "Image trop grande", "Une image compte au plus 40 millions de pixels."],
  ] as const)(
    "répond 422 en RFC 9457 pour une image refusée (%s)",
    async (rejection, title, detail) => {
      await withMe({ changeAvatar: async () => err(rejection) }, async (base) => {
        const response = await put(`${base}/avatar`, { uploadId: UPLOAD_ID });

        expect(response.status).toBe(422);
        expect(response.headers.get("content-type")).toContain("application/problem+json");
        expect(await response.json()).toMatchObject({ status: 422, title, detail });
      });
    },
  );

  it("refuse en 401 un jeton dont le compte n'existe plus", async () => {
    await withMe({ changeAvatar: async () => err("account_not_found") }, async (base) => {
      const response = await put(`${base}/avatar`, { uploadId: UPLOAD_ID });

      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe('Bearer error="invalid_token"');
    });
  });

  it.each([
    ["sans uploadId", {}],
    ["avec un uploadId qui n'est pas un UUID", { uploadId: "../incoming/autre" }],
    ["avec un champ inconnu", { uploadId: UPLOAD_ID, userId: "autre" }],
  ])("répond 400 à un corps %s", async (_name, body) => {
    await withMe({}, async (base, _bioChanges, _openApi, avatarChanges) => {
      expect((await put(`${base}/avatar`, body)).status).toBe(400);
      expect(avatarChanges).toEqual([]);
    });
  });

  it("figure dans l'OpenAPI, avec son corps et le compte en réponse", async () => {
    await withMe({}, async (_base, _bioChanges, openApi) => {
      expect(openApi).toMatchObject({
        paths: {
          "/v1/me/avatar": {
            put: {
              requestBody: {
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/AvatarUploadRequest" },
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
            AvatarUploadRequest: {
              required: ["uploadId"],
              additionalProperties: false,
            },
          },
        },
      });
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

describe("PUT /v1/me/chat-color (ADR 0051)", () => {
  it("change la couleur de pseudo du compte du jeton et rend le compte relu", async () => {
    const currentAccount: GetCurrentAccount = async () => ok({ ...ACCOUNT, chatColor: "#9146FF" });

    await withMe({ currentAccount }, async (base, _bio, _openApi, _avatar, chatColorChanges) => {
      const response = await put(`${base}/chat-color`, { chatColor: "#9146ff" });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ...ACCOUNT, chatColor: "#9146FF" });
      expect(chatColorChanges).toEqual([{ userId: USER_ID, chatColor: "#9146ff" }]);
    });
  });

  it("revient à la couleur par défaut avec null", async () => {
    await withMe({}, async (base, _bio, _openApi, _avatar, chatColorChanges) => {
      expect((await put(`${base}/chat-color`, { chatColor: null })).status).toBe(200);
      expect(chatColorChanges).toEqual([{ userId: USER_ID, chatColor: null }]);
    });
  });

  it("refuse en 400 RFC 9457 une couleur hors du format #RRGGBB", async () => {
    await withMe({ changeChatColor: async () => err("invalid_chat_color") }, async (base) => {
      const response = await put(`${base}/chat-color`, { chatColor: "violet" });

      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toContain("application/problem+json");
      expect(await response.json()).toMatchObject({
        title: "Couleur de pseudo invalide",
        detail: "La couleur s'écrit #RRGGBB, en hexadécimal.",
      });
    });
  });

  it.each([
    ["sans couleur", {}],
    ["avec une couleur qui n'est pas du texte", { chatColor: 9_520_895 }],
    ["avec un champ inconnu", { chatColor: "#9146FF", badge: "turbo" }],
  ])("refuse en 400 un corps %s, sans appeler le use-case", async (_name, body) => {
    await withMe({}, async (base, _bio, _openApi, _avatar, chatColorChanges) => {
      expect((await put(`${base}/chat-color`, body)).status).toBe(400);
      expect(chatColorChanges).toEqual([]);
    });
  });

  it("refuse en 401 un jeton dont le compte n'existe plus", async () => {
    await withMe({ changeChatColor: async () => err("account_not_found") }, async (base) => {
      const response = await put(`${base}/chat-color`, { chatColor: "#9146FF" });

      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe('Bearer error="invalid_token"');
    });
  });

  it("figure dans l'OpenAPI, avec le corps ChatColorRequest et la réponse Me", async () => {
    await withMe({}, async (_base, _bio, openApi) => {
      expect(openApi).toMatchObject({
        paths: {
          "/v1/me/chat-color": {
            put: {
              requestBody: {
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/ChatColorRequest" },
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
      });
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
