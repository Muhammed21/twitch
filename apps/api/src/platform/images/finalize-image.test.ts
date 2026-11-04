import { describe, expect, it } from "vitest";

import { err, ok } from "@repo/result";

import { finalizeImage, type ImageReencoder, imageUrlOf } from "./finalize-image.ts";
import { IMAGE_PURPOSES } from "./image-purposes.ts";
import { memoryImageStorage } from "./testing/memory-image-storage.ts";

const USER_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const OTHER_USER_ID = "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e";
const UPLOAD_ID = "0b6e2f3a-1c4d-4e5f-8a9b-0c1d2e3f4a5b";
const IMAGE_ID = "7c8d9e0f-1a2b-4c3d-8e4f-5a6b7c8d9e0f";
const PUBLIC_BASE_URL = "https://images.twitch.test/";

const JPEG_BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x01]);
const GIF_BYTES = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const WEBP_OUTPUT = Uint8Array.from([0x52, 0x49, 0x46, 0x46]);

const depositOf = (userId: string, purpose: string) => `incoming/${userId}/${purpose}/${UPLOAD_ID}`;

const reencodedAs =
  (output: Uint8Array): ImageReencoder =>
  async () =>
    ok(output);

const finalizeWith = ({
  storage,
  reencode = reencodedAs(WEBP_OUTPUT),
}: {
  storage: ReturnType<typeof memoryImageStorage>["storage"];
  reencode?: ImageReencoder;
}) =>
  finalizeImage({
    storage,
    reencode,
    newImageId: () => IMAGE_ID,
    publicBaseUrl: PUBLIC_BASE_URL,
  });

describe("confirmation d'un envoi d'image", () => {
  it("écrit la version réencodée sous une clé servie immuable, rend son URL et supprime le dépôt", async () => {
    const memory = memoryImageStorage({ [depositOf(USER_ID, "avatar")]: JPEG_BYTES });

    const finalized = await finalizeWith({ storage: memory.storage })({
      uploadId: UPLOAD_ID,
      purpose: "avatar",
      userId: USER_ID,
    });

    expect(finalized).toEqual({
      ok: true,
      value: {
        key: `images/avatar/${IMAGE_ID}.webp`,
        url: `https://images.twitch.test/images/avatar/${IMAGE_ID}.webp`,
      },
    });
    expect(memory.written.get(`images/avatar/${IMAGE_ID}.webp`)).toEqual({
      bytes: WEBP_OUTPUT,
      contentType: "image/webp",
      cacheControl: "public, max-age=31536000, immutable",
    });
    expect(memory.deleted).toEqual([depositOf(USER_ID, "avatar")]);
  });

  it("réencode avec le type lu dans les octets et les valeurs de l'usage", async () => {
    const memory = memoryImageStorage({ [depositOf(USER_ID, "banner")]: JPEG_BYTES });
    const calls: Parameters<ImageReencoder>[0][] = [];
    const reencode: ImageReencoder = async (request) => {
      calls.push(request);
      return ok(WEBP_OUTPUT);
    };

    await finalizeWith({ storage: memory.storage, reencode })({
      uploadId: UPLOAD_ID,
      purpose: "banner",
      userId: USER_ID,
    });

    expect(calls).toEqual([{ bytes: JPEG_BYTES, type: "image/jpeg", spec: IMAGE_PURPOSES.banner }]);
  });

  it("ne trouve pas le dépôt d'un autre utilisateur", async () => {
    const memory = memoryImageStorage({ [depositOf(OTHER_USER_ID, "avatar")]: JPEG_BYTES });

    expect(
      await finalizeWith({ storage: memory.storage })({
        uploadId: UPLOAD_ID,
        purpose: "avatar",
        userId: USER_ID,
      }),
    ).toEqual({ ok: false, error: "upload_not_found" });
    expect(memory.deleted).toEqual([]);
  });

  it("ne trouve pas un dépôt préparé pour un autre usage", async () => {
    const memory = memoryImageStorage({ [depositOf(USER_ID, "category")]: JPEG_BYTES });

    expect(
      await finalizeWith({ storage: memory.storage })({
        uploadId: UPLOAD_ID,
        purpose: "avatar",
        userId: USER_ID,
      }),
    ).toEqual({ ok: false, error: "upload_not_found" });
  });

  it.each(["../avatar/autre", "incoming", UPLOAD_ID.toUpperCase().replace("-", "/")])(
    "refuse l'identifiant d'envoi %s sans lire le stockage",
    async (uploadId) => {
      const memory = memoryImageStorage({ [`incoming/${USER_ID}/avatar/${uploadId}`]: JPEG_BYTES });

      expect(
        await finalizeWith({ storage: memory.storage })({
          uploadId,
          purpose: "avatar",
          userId: USER_ID,
        }),
      ).toEqual({ ok: false, error: "upload_not_found" });
    },
  );

  it("refuse un dépôt plus lourd que le poids maximal de l'usage et le supprime", async () => {
    const tooHeavy = new Uint8Array(IMAGE_PURPOSES.avatar.maxBytes + 1);
    tooHeavy.set(JPEG_BYTES);
    const memory = memoryImageStorage({ [depositOf(USER_ID, "avatar")]: tooHeavy });

    expect(
      await finalizeWith({ storage: memory.storage })({
        uploadId: UPLOAD_ID,
        purpose: "avatar",
        userId: USER_ID,
      }),
    ).toEqual({ ok: false, error: "too_large" });
    expect(memory.deleted).toEqual([depositOf(USER_ID, "avatar")]);
    expect(memory.written.size).toBe(0);
  });

  it("refuse un dépôt dont les octets ne sont ni JPEG, ni PNG, ni WebP, sans le réencoder", async () => {
    const memory = memoryImageStorage({ [depositOf(USER_ID, "avatar")]: GIF_BYTES });
    const calls: unknown[] = [];

    expect(
      await finalizeWith({
        storage: memory.storage,
        reencode: async (request) => {
          calls.push(request);
          return ok(WEBP_OUTPUT);
        },
      })({ uploadId: UPLOAD_ID, purpose: "avatar", userId: USER_ID }),
    ).toEqual({ ok: false, error: "unsupported_type" });
    expect(calls).toEqual([]);
    expect(memory.deleted).toEqual([depositOf(USER_ID, "avatar")]);
  });

  it.each(["too_small", "too_many_pixels", "unsupported_type"] as const)(
    "rend le refus %s du réencodage, supprime le dépôt et n'écrit rien",
    async (rejection) => {
      const memory = memoryImageStorage({ [depositOf(USER_ID, "avatar")]: JPEG_BYTES });

      expect(
        await finalizeWith({ storage: memory.storage, reencode: async () => err(rejection) })({
          uploadId: UPLOAD_ID,
          purpose: "avatar",
          userId: USER_ID,
        }),
      ).toEqual({ ok: false, error: rejection });
      expect(memory.deleted).toEqual([depositOf(USER_ID, "avatar")]);
      expect(memory.written.size).toBe(0);
    },
  );
});

describe("URL servie d'une image", () => {
  it.each([
    ["avec une barre finale", "https://images.twitch.test/"],
    ["sans barre finale", "https://images.twitch.test"],
  ])("joint la base publique %s et la clé", (_name, base) => {
    expect(imageUrlOf(base)("images/avatar/a.webp")).toBe(
      "https://images.twitch.test/images/avatar/a.webp",
    );
  });

  it("garde le chemin de la base publique", () => {
    expect(imageUrlOf("http://127.0.0.1:8333/twitch-local")("images/avatar/a.webp")).toBe(
      "http://127.0.0.1:8333/twitch-local/images/avatar/a.webp",
    );
  });
});
