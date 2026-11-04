import { randomUUID } from "node:crypto";

import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";

import { createImageBrick } from "./images.module.ts";
import { createS3ImageStorage } from "./infrastructure/s3-image-storage.ts";
import { prepareImageUpload } from "./prepare-image-upload.ts";

const variable = (name: string): string => {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`${name} manquante : copier .env.example en .env`);
  }
  return value;
};

const storage = createS3ImageStorage({
  endpoint: variable("S3_ENDPOINT"),
  publicEndpoint: variable("S3_ENDPOINT"),
  region: variable("S3_REGION"),
  bucket: variable("S3_BUCKET"),
  accessKeyId: variable("S3_ACCESS_KEY_ID"),
  secretAccessKey: variable("S3_SECRET_ACCESS_KEY"),
});
const brick = createImageBrick({ storage, publicBaseUrl: variable("S3_PUBLIC_BASE_URL") });
const prepare = prepareImageUpload({ storage, newUploadId: randomUUID, now: () => new Date() });

const written: string[] = [];

afterAll(async () => {
  await Promise.all(written.map((key) => storage.delete(key)));
});

const makeJpeg = async (width: number, height: number) =>
  new Uint8Array(
    await sharp({ create: { width, height, channels: 3, background: { r: 10, g: 120, b: 200 } } })
      .jpeg()
      .toBuffer(),
  );

const deposit = async ({
  userId,
  bytes,
  contentType = "image/jpeg",
}: {
  userId: string;
  bytes: Uint8Array<ArrayBuffer>;
  contentType?: string;
}) => {
  const prepared = await prepare({
    userId,
    purpose: "avatar",
    contentType,
    byteSize: bytes.length,
  });
  if (!prepared.ok) {
    throw new Error(prepared.error);
  }
  written.push(`incoming/${userId}/avatar/${prepared.value.uploadId}`);
  const response = await fetch(prepared.value.uploadUrl, {
    method: "PUT",
    headers: prepared.value.headers,
    body: bytes,
  });
  expect(response.status).toBe(200);
  return prepared.value.uploadId;
};

describe("envoi d'une image, de la préparation à l'URL servie", () => {
  it("sert en lecture anonyme un WebP 512 × 512, avec un cache d'un an, et efface le dépôt", async () => {
    const userId = randomUUID();
    const uploadId = await deposit({ userId, bytes: await makeJpeg(800, 600) });

    const finalized = await brick.finalizeImage({ uploadId, purpose: "avatar", userId });

    expect(finalized.ok).toBe(true);
    const { key, url } = finalized.ok ? finalized.value : { key: "", url: "" };
    written.push(key);
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    const metadata = await sharp(new Uint8Array(await response.arrayBuffer())).metadata();
    expect([metadata.format, metadata.width, metadata.height]).toEqual(["webp", 512, 512]);
    expect(
      await storage.read({ key: `incoming/${userId}/avatar/${uploadId}`, maxBytes: 1 }),
    ).toEqual({ kind: "missing" });
  });

  it("refuse le dépôt d'un autre utilisateur", async () => {
    const uploadId = await deposit({ userId: randomUUID(), bytes: await makeJpeg(300, 300) });

    expect(
      await brick.finalizeImage({ uploadId, purpose: "avatar", userId: randomUUID() }),
    ).toEqual({ ok: false, error: "upload_not_found" });
  });

  it("refuse un dépôt dont les octets ne sont pas une image acceptée, et l'efface", async () => {
    const userId = randomUUID();
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    const uploadId = await deposit({ userId, bytes: svg });

    expect(await brick.finalizeImage({ uploadId, purpose: "avatar", userId })).toEqual({
      ok: false,
      error: "unsupported_type",
    });
    expect(
      await storage.read({ key: `incoming/${userId}/avatar/${uploadId}`, maxBytes: 1_000 }),
    ).toEqual({ kind: "missing" });
  });
});
