import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { createS3Client, s3ImageStorage } from "./s3-image-storage.ts";

const variable = (name: string): string => {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`${name} manquante : copier .env.example en .env`);
  }
  return value;
};

const client = createS3Client({
  endpoint: variable("S3_ENDPOINT"),
  region: variable("S3_REGION"),
  accessKeyId: variable("S3_ACCESS_KEY_ID"),
  secretAccessKey: variable("S3_SECRET_ACCESS_KEY"),
});
const storage = s3ImageStorage({ client, bucket: variable("S3_BUCKET") });

const PREFIX = `test/${randomUUID()}`;
const keyOf = (name: string) => `${PREFIX}/${name}`;
const written: string[] = [];

const BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

const putPresigned = async (
  key: string,
  body: Uint8Array<ArrayBuffer>,
  headers: Record<string, string>,
) => {
  const url = await storage.presignPut({
    key,
    contentType: "image/jpeg",
    contentLength: BYTES.length,
    expiresInSeconds: 60,
  });
  written.push(key);
  return fetch(url, { method: "PUT", headers, body });
};

afterAll(async () => {
  await Promise.all(written.map((key) => storage.delete(key)));
  client.destroy();
});

describe.skipIf(process.env.INTEGRATION_S3 !== "1")("stockage S3 des images", () => {
  it("accepte un dépôt sur l'URL présignée avec les en-têtes figés, puis le relit", async () => {
    const key = keyOf("depot");

    const response = await putPresigned(key, BYTES, {
      "content-type": "image/jpeg",
      "content-length": String(BYTES.length),
    });

    expect(response.status).toBe(200);
    expect(await storage.read({ key, maxBytes: 100 })).toEqual({ kind: "found", bytes: BYTES });
  });

  it("refuse un dépôt sur l'URL présignée avec un autre type de contenu", async () => {
    const key = keyOf("autre-type");

    const response = await putPresigned(key, BYTES, {
      "content-type": "image/svg+xml",
      "content-length": String(BYTES.length),
    });

    expect(response.status).toBe(403);
    expect(await storage.read({ key, maxBytes: 100 })).toEqual({ kind: "missing" });
  });

  it("signale un objet plus lourd que le plafond de lecture", async () => {
    const key = keyOf("lourd");
    await storage.write({ key, bytes: BYTES, contentType: "image/jpeg", cacheControl: "no-store" });
    written.push(key);

    expect(await storage.read({ key, maxBytes: BYTES.length - 1 })).toEqual({ kind: "too_large" });
    expect(await storage.read({ key, maxBytes: BYTES.length })).toEqual({
      kind: "found",
      bytes: BYTES,
    });
  });

  it("signale un objet absent", async () => {
    expect(await storage.read({ key: keyOf("absent"), maxBytes: 100 })).toEqual({
      kind: "missing",
    });
  });

  it("supprime un objet", async () => {
    const key = keyOf("supprime");
    await storage.write({ key, bytes: BYTES, contentType: "image/jpeg", cacheControl: "no-store" });

    await storage.delete(key);

    expect(await storage.read({ key, maxBytes: 100 })).toEqual({ kind: "missing" });
  });
});
