import { describe, expect, it } from "vitest";

import { prepareImageUpload } from "./prepare-image-upload.ts";
import { memoryImageStorage } from "./testing/memory-image-storage.ts";

const USER_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const UPLOAD_ID = "0b6e2f3a-1c4d-4e5f-8a9b-0c1d2e3f4a5b";
const NOW = new Date("2026-11-04T12:00:00.000Z");
const TEN_MIB = 10 * 1024 * 1024;

const prepareWith = (storage: ReturnType<typeof memoryImageStorage>["storage"]) =>
  prepareImageUpload({ storage, newUploadId: () => UPLOAD_ID, now: () => NOW });

const makeRequest = (overrides: Partial<Parameters<ReturnType<typeof prepareWith>>[0]> = {}) => ({
  userId: USER_ID,
  purpose: "avatar" as const,
  contentType: "image/jpeg",
  byteSize: 200_000,
  ...overrides,
});

describe("préparation d'un envoi d'image", () => {
  it("rend une URL de dépôt présignée pour 5 minutes, sous la clé de l'utilisateur et de l'usage", async () => {
    const { storage, presigned } = memoryImageStorage();

    expect(await prepareWith(storage)(makeRequest())).toEqual({
      ok: true,
      value: {
        uploadId: UPLOAD_ID,
        uploadUrl: `https://s3.test/incoming/${USER_ID}/avatar/${UPLOAD_ID}?signature=1`,
        headers: { "Content-Type": "image/jpeg", "Content-Length": "200000" },
        expiresAt: new Date("2026-11-04T12:05:00.000Z"),
      },
    });
    expect(presigned).toEqual([
      {
        key: `incoming/${USER_ID}/avatar/${UPLOAD_ID}`,
        contentType: "image/jpeg",
        contentLength: 200_000,
        expiresInSeconds: 300,
      },
    ]);
  });

  it.each(["image/png", "image/webp"])("accepte %s", async (contentType) => {
    const { storage } = memoryImageStorage();

    expect((await prepareWith(storage)(makeRequest({ contentType }))).ok).toBe(true);
  });

  it.each(["image/heic", "image/gif", "image/svg+xml", "application/octet-stream"])(
    "refuse %s sans rien présigner",
    async (contentType) => {
      const { storage, presigned } = memoryImageStorage();

      expect(await prepareWith(storage)(makeRequest({ contentType }))).toEqual({
        ok: false,
        error: "unsupported_type",
      });
      expect(presigned).toEqual([]);
    },
  );

  it("accepte le poids maximal de l'usage", async () => {
    const { storage } = memoryImageStorage();

    expect((await prepareWith(storage)(makeRequest({ byteSize: TEN_MIB }))).ok).toBe(true);
  });

  it("refuse un octet de plus que le poids maximal, sans rien présigner", async () => {
    const { storage, presigned } = memoryImageStorage();

    expect(await prepareWith(storage)(makeRequest({ byteSize: TEN_MIB + 1 }))).toEqual({
      ok: false,
      error: "too_large",
    });
    expect(presigned).toEqual([]);
  });
});
