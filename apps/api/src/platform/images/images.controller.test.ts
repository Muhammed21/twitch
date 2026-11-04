import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import type { AccessTokenIdentity } from "@repo/auth-verifier";
import { err, ok } from "@repo/result";

import { buildOpenApiDocument } from "../../openapi/build-document.ts";
import type { AccessTokenVerifier } from "../authentication.ts";
import { configureApp } from "../configure-app.ts";
import { PlatformModule } from "../platform.module.ts";
import type { RateDecision } from "../rate-limit.ts";
import {
  IMAGE_UPLOAD_RATE_LIMIT,
  type ImageUploadRateLimit,
  ImagesController,
  PREPARE_IMAGE_UPLOAD,
  type PrepareUpload,
} from "./images.controller.ts";

const USER_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const UPLOAD_ID = "0b6e2f3a-1c4d-4e5f-8a9b-0c1d2e3f4a5b";

const IDENTITY: AccessTokenIdentity = {
  userId: USER_ID,
  sid: "sid-1",
  scopes: [],
  authTime: null,
  amr: [],
  revocation: "checked",
};

const verifier: AccessTokenVerifier = {
  verify: async (token) => (token === "jeton" ? ok(IDENTITY) : err("invalid_token")),
};

const PREPARED = {
  uploadId: UPLOAD_ID,
  uploadUrl: `http://127.0.0.1:8333/twitch-local/incoming/${USER_ID}/avatar/${UPLOAD_ID}?X-Amz-Signature=1`,
  headers: { "Content-Type": "image/jpeg", "Content-Length": "200000" },
  expiresAt: new Date("2026-11-04T12:05:00.000Z"),
};

const ALLOWED: RateDecision = { allowed: true };

const withImages = async (
  {
    prepare = async () => ok(PREPARED),
    rateLimit = async () => ALLOWED,
  }: { prepare?: PrepareUpload; rateLimit?: ImageUploadRateLimit },
  run: (context: {
    post: (body: unknown, token?: string) => Promise<Response>;
    preparations: Parameters<PrepareUpload>[0][];
    limited: string[];
    openApi: ReturnType<typeof buildOpenApiDocument>;
  }) => Promise<void>,
) => {
  const preparations: Parameters<PrepareUpload>[0][] = [];
  const limited: string[] = [];
  const moduleRef = await Test.createTestingModule({
    imports: [
      PlatformModule.register({
        schemaVersionCheck: async () => {},
        logSink: () => {},
        accessTokenVerifier: verifier,
      }),
    ],
    controllers: [ImagesController],
    providers: [
      {
        provide: PREPARE_IMAGE_UPLOAD,
        useValue: (request: Parameters<PrepareUpload>[0]) => {
          preparations.push(request);
          return prepare(request);
        },
      },
      {
        provide: IMAGE_UPLOAD_RATE_LIMIT,
        useValue: (userId: string) => {
          limited.push(userId);
          return rateLimit(userId);
        },
      },
    ],
  }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.listen(0, "127.0.0.1");
  const url = `${await app.getUrl()}/v1/images/uploads`;
  try {
    await run({
      post: (body, token = "jeton") =>
        fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        }),
      preparations,
      limited,
      openApi: buildOpenApiDocument(app),
    });
  } finally {
    await app.close();
  }
};

const AVATAR_JPEG = { purpose: "avatar", contentType: "image/jpeg", byteSize: 200_000 };

describe("POST /v1/images/uploads", () => {
  it("prépare le dépôt de l'utilisateur du jeton et rend l'URL présignée", async () => {
    await withImages({}, async ({ post, preparations }) => {
      const response = await post(AVATAR_JPEG);

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({
        ...PREPARED,
        expiresAt: "2026-11-04T12:05:00.000Z",
      });
      expect(preparations).toEqual([{ userId: USER_ID, ...AVATAR_JPEG }]);
    });
  });

  it.each(["banner", "category"])("prépare un dépôt pour l'usage %s", async (purpose) => {
    await withImages({}, async ({ post, preparations }) => {
      expect((await post({ ...AVATAR_JPEG, purpose })).status).toBe(201);
      expect(preparations).toMatchObject([{ purpose }]);
    });
  });

  it("refuse en 401 une requête sans jeton valide, sans rien préparer", async () => {
    await withImages({}, async ({ post, preparations }) => {
      expect((await post(AVATAR_JPEG, "invalide")).status).toBe(401);
      expect(preparations).toEqual([]);
    });
  });

  it("refuse en 429 au-delà de la limite de l'utilisateur, sans rien préparer", async () => {
    await withImages(
      { rateLimit: async () => ({ allowed: false, retryAfterSeconds: 42 }) },
      async ({ post, preparations, limited }) => {
        const response = await post(AVATAR_JPEG);

        expect(response.status).toBe(429);
        expect(response.headers.get("retry-after")).toBe("42");
        expect(limited).toEqual([USER_ID]);
        expect(preparations).toEqual([]);
      },
    );
  });

  it.each([
    ["unsupported_type", "Type d'image refusé"],
    ["too_large", "Image trop lourde"],
  ] as const)("refuse en 422 un dépôt %s", async (error, title) => {
    await withImages({ prepare: async () => err(error) }, async ({ post }) => {
      const response = await post(AVATAR_JPEG);

      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ status: 422, title });
    });
  });

  it.each([
    ["sans usage", { contentType: "image/jpeg", byteSize: 1 }],
    ["avec un usage inconnu", { ...AVATAR_JPEG, purpose: "emote" }],
    ["sans type", { purpose: "avatar", byteSize: 1 }],
    ["avec un poids nul", { ...AVATAR_JPEG, byteSize: 0 }],
    ["avec un poids décimal", { ...AVATAR_JPEG, byteSize: 1.5 }],
    ["avec un poids en texte", { ...AVATAR_JPEG, byteSize: "200000" }],
    ["avec un champ inconnu", { ...AVATAR_JPEG, userId: USER_ID }],
  ])("répond 400 à un corps %s, sans rien préparer", async (_name, body) => {
    await withImages({}, async ({ post, preparations }) => {
      expect((await post(body)).status).toBe(400);
      expect(preparations).toEqual([]);
    });
  });

  it("documente le corps et la réponse dans le contrat OpenAPI", async () => {
    await withImages({}, async ({ openApi }) => {
      expect(openApi).toMatchObject({
        paths: {
          "/v1/images/uploads": {
            post: {
              requestBody: {
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/PrepareImageUploadRequest" },
                  },
                },
              },
              responses: {
                201: {
                  content: {
                    "application/json": { schema: { $ref: "#/components/schemas/ImageUpload" } },
                  },
                },
              },
            },
          },
        },
        components: {
          schemas: {
            PrepareImageUploadRequest: {
              required: ["purpose", "contentType", "byteSize"],
              additionalProperties: false,
              properties: {
                purpose: { enum: ["avatar", "banner", "category"] },
                contentType: {
                  type: "string",
                  description:
                    "image/jpeg, image/png ou image/webp ; tout autre type est refusé en 422.",
                },
                byteSize: { type: "integer", minimum: 1 },
              },
            },
          },
        },
      });
    });
  });
});
