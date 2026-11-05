import { randomUUID } from "node:crypto";

import { Test } from "@nestjs/testing";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";

import type { AccessTokenIdentity } from "@repo/auth-verifier";
import { responses } from "@repo/contracts";
import { createContextClient } from "@repo/db";
import { ok } from "@repo/result";

import type { AccessTokenVerifier } from "../../platform/authentication.ts";
import { configureApp } from "../../platform/configure-app.ts";
import { createImageBrick } from "../../platform/images/images.module.ts";
import { createS3ImageStorage } from "../../platform/images/infrastructure/s3-image-storage.ts";
import { prepareImageUpload } from "../../platform/images/prepare-image-upload.ts";
import { PlatformModule } from "../../platform/platform.module.ts";
import { createIdentityRedis, IdentityModule } from "./identity.module.ts";

const variable = (name: string): string => {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`${name} manquante : copier .env.example en .env`);
  }
  return value;
};

const identity = createContextClient({ context: "identity", env: process.env });
const storage = createS3ImageStorage({
  endpoint: variable("S3_ENDPOINT"),
  publicEndpoint: variable("S3_PUBLIC_ENDPOINT"),
  region: variable("S3_REGION"),
  bucket: variable("S3_BUCKET"),
  accessKeyId: variable("S3_ACCESS_KEY_ID"),
  secretAccessKey: variable("S3_SECRET_ACCESS_KEY"),
});
const images = createImageBrick({ storage, publicBaseUrl: variable("S3_PUBLIC_BASE_URL") });
const prepare = prepareImageUpload({ storage, newUploadId: randomUUID, now: () => new Date() });

const seededUsers: string[] = [];
const servedKeys: string[] = [];

afterAll(async () => {
  await Promise.all(servedKeys.map((key) => storage.delete(key)));
  await identity.identityUser.deleteMany({ where: { id: { in: seededUsers } } });
  await identity.$disconnect();
});

const seedUser = async (): Promise<string> => {
  const id = randomUUID();
  await identity.identityUser.create({
    data: { id, name: "Avatar de test", email: `avatar-${id}@twitch.local` },
  });
  seededUsers.push(id);
  return id;
};

const verifierFor = (userId: string): AccessTokenVerifier => ({
  verify: async () =>
    ok({
      userId,
      sid: "sid-1",
      scopes: [],
      authTime: null,
      amr: [],
      revocation: "checked",
    } satisfies AccessTokenIdentity),
});

const withIdentity = async (userId: string, run: (base: string) => Promise<void>) => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      PlatformModule.register({
        schemaVersionCheck: async () => {},
        logSink: () => {},
        accessTokenVerifier: verifierFor(userId),
      }),
      IdentityModule.register({
        prisma: createContextClient({ context: "identity", env: process.env }),
        redis: createIdentityRedis(),
        lastLiveOf: async () => undefined,
        images,
        logSink: () => {},
      }),
    ],
  }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.listen(0, "127.0.0.1");
  try {
    await run(`${await app.getUrl()}/v1/me`);
  } finally {
    await app.close();
  }
};

const makeJpeg = async (width: number, height: number) =>
  new Uint8Array(
    await sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 90 } } })
      .jpeg()
      .toBuffer(),
  );

const deposit = async (userId: string): Promise<string> => {
  const bytes = await makeJpeg(600, 400);
  const prepared = await prepare({
    userId,
    purpose: "avatar",
    contentType: "image/jpeg",
    byteSize: bytes.length,
  });
  if (!prepared.ok) {
    throw new Error(prepared.error);
  }
  const response = await fetch(prepared.value.uploadUrl, {
    method: "PUT",
    headers: prepared.value.headers,
    body: bytes,
  });
  expect(response.status).toBe(200);
  return prepared.value.uploadId;
};

const confirm = async (base: string, uploadId: string) => {
  const response = await fetch(`${base}/avatar`, {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: "Bearer jeton" },
    body: JSON.stringify({ uploadId }),
  });
  expect(response.status).toBe(200);
  const me = responses.Me.parse(await response.json());
  const avatarUrl = me.avatarUrl ?? "";
  servedKeys.push(new URL(avatarUrl).pathname.split("/").slice(2).join("/"));
  return avatarUrl;
};

describe.skipIf(process.env.INTEGRATION_S3 !== "1")(
  "avatar du compte, par PUT /v1/me/avatar",
  () => {
    it("sert l'avatar confirmé, le rend dans GET /v1/me, puis efface l'ancien au remplacement", async () => {
      const userId = await seedUser();

      await withIdentity(userId, async (base) => {
        const first = await confirm(base, await deposit(userId));
        const served = await fetch(first);
        const metadata = await sharp(new Uint8Array(await served.arrayBuffer())).metadata();
        expect([served.status, metadata.format, metadata.width, metadata.height]).toEqual([
          200,
          "webp",
          512,
          512,
        ]);
        const read = await fetch(base, { headers: { authorization: "Bearer jeton" } });
        expect(responses.Me.parse(await read.json()).avatarUrl).toBe(first);

        const second = await confirm(base, await deposit(userId));

        expect(second).not.toBe(first);
        expect((await fetch(second)).status).toBe(200);
        expect((await fetch(first)).status).not.toBe(200);
      });
    });

    it("refuse en 422 le dépôt d'un autre utilisateur, sans changer l'avatar", async () => {
      const userId = await seedUser();
      const uploadId = await deposit(await seedUser());

      await withIdentity(userId, async (base) => {
        const response = await fetch(`${base}/avatar`, {
          method: "PUT",
          headers: { "content-type": "application/json", authorization: "Bearer jeton" },
          body: JSON.stringify({ uploadId }),
        });

        expect(response.status).toBe(422);
        expect(await response.json()).toMatchObject({ title: "Envoi introuvable" });
        const stored = await identity.identityUser.findUnique({
          where: { id: userId },
          select: { avatarKey: true },
        });
        expect(stored).toEqual({ avatarKey: null });
      });
    });
  },
);
