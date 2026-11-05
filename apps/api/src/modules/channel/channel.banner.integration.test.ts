import { randomUUID } from "node:crypto";

import { Test } from "@nestjs/testing";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";

import type { AccessTokenIdentity } from "@repo/auth-verifier";
import { responses } from "@repo/contracts";
import { createContextClient } from "@repo/db";
import { err, ok } from "@repo/result";

import type { AccessTokenVerifier } from "../../platform/authentication.ts";
import { configureApp } from "../../platform/configure-app.ts";
import { createImageBrick } from "../../platform/images/images.module.ts";
import { createS3ImageStorage } from "../../platform/images/infrastructure/s3-image-storage.ts";
import { prepareImageUpload } from "../../platform/images/prepare-image-upload.ts";
import { PlatformModule } from "../../platform/platform.module.ts";
import { changeBanner } from "./application/change-banner.ts";
import { getChannel } from "./application/channel-queries.ts";
import {
  prismaBannerStore,
  prismaChannelDirectory,
} from "./infrastructure/prisma-channel-directory.ts";
import {
  CHANNEL_IMAGE_URL,
  ChannelsController,
  GET_CHANNEL,
  UPDATE_CHANNEL,
} from "./presentation/channels.controller.ts";
import { CHANGE_BANNER, MeBannerController } from "./presentation/me-banner.controller.ts";

const variable = (name: string): string => {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`${name} manquante : copier .env.example en .env`);
  }
  return value;
};

const prisma = createContextClient({ context: "channel", env: process.env });
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
const directory = prismaChannelDirectory(prisma);

const seededChannels: string[] = [];
const servedKeys: string[] = [];

afterAll(async () => {
  await Promise.all(servedKeys.map((key) => storage.delete(key)));
  await prisma.channel.deleteMany({ where: { id: { in: seededChannels } } });
  await prisma.$disconnect();
});

const seedChannel = async () => {
  const channel = {
    id: randomUUID(),
    ownerId: randomUUID(),
    slug: `banniere_${randomUUID().slice(0, 8)}`,
  };
  await prisma.channel.create({ data: channel });
  seededChannels.push(channel.id);
  return channel;
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

const withBanner = async (userId: string, run: (base: string) => Promise<void>) => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      PlatformModule.register({
        schemaVersionCheck: async () => {},
        logSink: () => {},
        accessTokenVerifier: verifierFor(userId),
      }),
    ],
    controllers: [MeBannerController, ChannelsController],
    providers: [
      { provide: CHANNEL_IMAGE_URL, useValue: images.imageUrlOf },
      { provide: GET_CHANNEL, useValue: getChannel(directory) },
      { provide: UPDATE_CHANNEL, useValue: async () => err("forbidden") },
      {
        provide: CHANGE_BANNER,
        useValue: changeBanner({
          store: prismaBannerStore(prisma),
          finalizeImage: images.finalizeImage,
          discardImage: (key) => storage.delete(key),
          onDiscardFailure: () => {},
        }),
      },
    ],
  }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.listen(0, "127.0.0.1");
  try {
    await run(`${await app.getUrl()}/v1`);
  } finally {
    await app.close();
  }
};

const makeJpeg = async (width: number, height: number) =>
  new Uint8Array(
    await sharp({ create: { width, height, channels: 3, background: { r: 30, g: 90, b: 200 } } })
      .jpeg()
      .toBuffer(),
  );

const deposit = async (userId: string): Promise<string> => {
  const bytes = await makeJpeg(1600, 900);
  const prepared = await prepare({
    userId,
    purpose: "banner",
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

const putBanner = (base: string, uploadId: string) =>
  fetch(`${base}/me/banner`, {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: "Bearer jeton" },
    body: JSON.stringify({ uploadId }),
  });

const confirm = async (base: string, uploadId: string) => {
  const response = await putBanner(base, uploadId);
  expect(response.status).toBe(200);
  const bannerUrl = responses.Channel.parse(await response.json()).bannerUrl ?? "";
  servedKeys.push(new URL(bannerUrl).pathname.split("/").slice(2).join("/"));
  return bannerUrl;
};

describe.skipIf(process.env.INTEGRATION_S3 !== "1")(
  "bannière de la chaîne, par PUT /v1/me/banner",
  () => {
    it("sert la bannière confirmée, la rend dans GET /v1/channels/{slug}, puis efface l'ancienne au remplacement", async () => {
      const channel = await seedChannel();

      await withBanner(channel.ownerId, async (base) => {
        const first = await confirm(base, await deposit(channel.ownerId));
        const served = await fetch(first);
        const metadata = await sharp(new Uint8Array(await served.arrayBuffer())).metadata();
        expect([served.status, metadata.format, metadata.width, metadata.height]).toEqual([
          200,
          "webp",
          1920,
          768,
        ]);
        const read = await fetch(`${base}/channels/${channel.slug}`);
        expect(responses.Channel.parse(await read.json()).bannerUrl).toBe(first);

        const second = await confirm(base, await deposit(channel.ownerId));

        expect(second).not.toBe(first);
        expect((await fetch(second)).status).toBe(200);
        expect((await fetch(first)).status).not.toBe(200);
      });
    });

    it("refuse en 422 le dépôt d'un autre utilisateur, sans changer la bannière", async () => {
      const channel = await seedChannel();
      const uploadId = await deposit(randomUUID());

      await withBanner(channel.ownerId, async (base) => {
        const response = await putBanner(base, uploadId);

        expect(response.status).toBe(422);
        expect(await response.json()).toMatchObject({ title: "Envoi introuvable" });
        expect(
          await prisma.channel.findUnique({
            where: { id: channel.id },
            select: { bannerKey: true },
          }),
        ).toEqual({ bannerKey: null });
      });
    });

    it("répond 404 quand le compte du jeton n'a pas de chaîne", async () => {
      const userId = randomUUID();
      const uploadId = await deposit(userId);

      await withBanner(userId, async (base) => {
        const response = await putBanner(base, uploadId);

        expect(response.status).toBe(404);
        expect(await response.json()).toMatchObject({ title: "Chaîne introuvable" });
      });
    });
  },
);
