import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import type { AccessTokenIdentity } from "@repo/auth-verifier";
import { err, ok } from "@repo/result";

import { buildOpenApiDocument } from "../../../openapi/build-document.ts";
import type { AccessTokenVerifier } from "../../../platform/authentication.ts";
import { configureApp } from "../../../platform/configure-app.ts";
import { PlatformModule } from "../../../platform/platform.module.ts";
import type { ChannelView } from "../application/channel-queries.ts";
import { CHANNEL_IMAGE_URL } from "./channels.controller.ts";
import { CHANGE_BANNER, type ChangeBanner, MeBannerController } from "./me-banner.controller.ts";

const USER_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const UPLOAD_ID = "0b6e7a52-2f4e-4c55-9f0e-6a1d2c3b4a59";
const BANNER_KEY = "images/banner/1f0e8d2c-3b4a-4c5d-8e6f-7a8b9c0d1e2f.webp";

const imageUrlOf = (key: string) => `https://images.twitch.example/${key}`;

const makeChannel = (overrides: Partial<ChannelView> = {}): ChannelView => ({
  id: "9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69",
  slug: "streamer_de_test",
  title: "Speedrun du dimanche",
  ownerId: USER_ID,
  category: null,
  tags: [],
  language: null,
  contentLabels: [],
  isBrandedContent: false,
  bannerKey: null,
  ...overrides,
});

const IDENTITY: AccessTokenIdentity = {
  userId: USER_ID,
  sid: "sid-1",
  scopes: [],
  authTime: null,
  amr: [],
  revocation: "checked",
};

const acceptingVerifier: AccessTokenVerifier = { verify: async () => ok(IDENTITY) };

const withBanner = async (
  {
    changeBanner = async () => ok(makeChannel({ bannerKey: BANNER_KEY })),
  }: { changeBanner?: ChangeBanner },
  run: (
    base: string,
    changes: Parameters<ChangeBanner>[0][],
    openApi: ReturnType<typeof buildOpenApiDocument>,
  ) => Promise<void>,
) => {
  const changes: Parameters<ChangeBanner>[0][] = [];
  const moduleRef = await Test.createTestingModule({
    imports: [
      PlatformModule.register({
        schemaVersionCheck: async () => {},
        logSink: () => {},
        accessTokenVerifier: acceptingVerifier,
      }),
    ],
    controllers: [MeBannerController],
    providers: [
      { provide: CHANNEL_IMAGE_URL, useValue: imageUrlOf },
      {
        provide: CHANGE_BANNER,
        useValue: (change: Parameters<ChangeBanner>[0]) => {
          changes.push(change);
          return changeBanner(change);
        },
      },
    ],
  }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.listen(0, "127.0.0.1");
  try {
    await run(`${await app.getUrl()}/v1/me/banner`, changes, buildOpenApiDocument(app));
  } finally {
    await app.close();
  }
};

const put = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: "Bearer jeton", ...headers },
    body: JSON.stringify(body),
  });

describe("PUT /v1/me/banner", () => {
  it("confirme l'envoi en bannière de l'identité du jeton et rend la chaîne avec son URL", async () => {
    await withBanner({}, async (base, changes) => {
      const response = await put(base, { uploadId: UPLOAD_ID });
      const { category: _none, bannerKey: _key, language: _noLanguage, ...channel } = makeChannel();

      expect(response.status).toBe(200);
      expect(await response.json()).toStrictEqual({
        ...channel,
        bannerUrl: imageUrlOf(BANNER_KEY),
      });
      expect(changes).toEqual([{ userId: USER_ID, uploadId: UPLOAD_ID }]);
    });
  });

  it.each([
    [
      "upload_not_found",
      "Envoi introuvable",
      "Préparez un nouvel envoi : celui-ci n'existe pas ou a expiré.",
    ],
    ["too_large", "Image trop lourde", "Une bannière pèse au plus 10 Mio."],
    ["unsupported_type", "Type d'image refusé", "Envoyez une image JPEG, PNG ou WebP."],
    ["too_small", "Image trop petite", "Une bannière mesure au moins 1200 × 480 pixels."],
    ["too_many_pixels", "Image trop grande", "Une image compte au plus 40 millions de pixels."],
  ] as const)(
    "répond 422 en RFC 9457 pour une image refusée (%s)",
    async (rejection, title, detail) => {
      await withBanner({ changeBanner: async () => err(rejection) }, async (base) => {
        const response = await put(base, { uploadId: UPLOAD_ID });

        expect(response.status).toBe(422);
        expect(response.headers.get("content-type")).toContain("application/problem+json");
        expect(await response.json()).toMatchObject({ status: 422, title, detail });
      });
    },
  );

  it("répond 404 quand l'identité du jeton n'a pas de chaîne", async () => {
    await withBanner({ changeBanner: async () => err("channel_not_found") }, async (base) => {
      const response = await put(base, { uploadId: UPLOAD_ID });

      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ status: 404, title: "Chaîne introuvable" });
    });
  });

  it("refuse en 401 une requête sans jeton", async () => {
    await withBanner({}, async (base, changes) => {
      const response = await fetch(base, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ uploadId: UPLOAD_ID }),
      });

      expect(response.status).toBe(401);
      expect(changes).toEqual([]);
    });
  });

  it.each([
    ["sans uploadId", {}],
    ["avec un uploadId qui n'est pas un UUID", { uploadId: "../incoming/autre" }],
    ["avec un champ inconnu", { uploadId: UPLOAD_ID, ownerId: "autre" }],
  ])("répond 400 à un corps %s", async (_name, body) => {
    await withBanner({}, async (base, changes) => {
      expect((await put(base, body)).status).toBe(400);
      expect(changes).toEqual([]);
    });
  });

  it("figure dans l'OpenAPI, avec son corps et la chaîne en réponse", async () => {
    await withBanner({}, async (_base, _changes, openApi) => {
      expect(openApi).toMatchObject({
        paths: {
          "/v1/me/banner": {
            put: {
              requestBody: {
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/BannerUploadRequest" },
                  },
                },
              },
              responses: {
                200: {
                  content: {
                    "application/json": { schema: { $ref: "#/components/schemas/Channel" } },
                  },
                },
              },
            },
          },
        },
        components: {
          schemas: {
            BannerUploadRequest: { required: ["uploadId"], additionalProperties: false },
          },
        },
      });
    });
  });
});
