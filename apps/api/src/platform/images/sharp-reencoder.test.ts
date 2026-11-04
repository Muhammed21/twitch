import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { IMAGE_PURPOSES } from "./image-purposes.ts";
import { sharpReencoder } from "./sharp-reencoder.ts";

const RED = { r: 200, g: 30, b: 30 };

const makeImage = async ({
  width,
  height,
  format = "jpeg",
  orientation,
}: {
  width: number;
  height: number;
  format?: "jpeg" | "png" | "webp";
  orientation?: number;
}) => {
  const image = sharp({ create: { width, height, channels: 3, background: RED } });
  const withMetadata = orientation === undefined ? image : image.withMetadata({ orientation });
  return new Uint8Array(await withMetadata.toFormat(format).toBuffer());
};

const reencode = sharpReencoder({ maxInputPixels: 4_000_000 });

const metadataOf = (bytes: Uint8Array) => sharp(bytes).metadata();

describe("réencodage d'une image envoyée", () => {
  it.each(["jpeg", "png", "webp"] as const)(
    "rend un WebP aux dimensions de sortie de l'usage depuis un %s",
    async (format) => {
      const bytes = await makeImage({ width: 600, height: 400, format });

      const reencoded = await reencode({
        bytes,
        type: `image/${format}`,
        spec: IMAGE_PURPOSES.avatar,
      });

      expect(reencoded.ok).toBe(true);
      const metadata = await metadataOf(reencoded.ok ? reencoded.value : new Uint8Array());
      expect({ format: metadata.format, width: metadata.width, height: metadata.height }).toEqual({
        format: "webp",
        width: 512,
        height: 512,
      });
    },
  );

  it("recadre une bannière en 1920 × 768", async () => {
    const bytes = await makeImage({ width: 2400, height: 1000 });

    const reencoded = await reencode({ bytes, type: "image/jpeg", spec: IMAGE_PURPOSES.banner });

    const metadata = await metadataOf(reencoded.ok ? reencoded.value : new Uint8Array());
    expect([metadata.width, metadata.height]).toEqual([1920, 768]);
  });

  it("retire les métadonnées EXIF", async () => {
    const bytes = await makeImage({ width: 600, height: 600, orientation: 1 });
    expect((await metadataOf(bytes)).exif).toBeDefined();

    const reencoded = await reencode({ bytes, type: "image/jpeg", spec: IMAGE_PURPOSES.avatar });

    const metadata = await metadataOf(reencoded.ok ? reencoded.value : new Uint8Array());
    expect(metadata.exif).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
  });

  it("accepte les dimensions minimales de l'usage", async () => {
    const bytes = await makeImage({ width: 256, height: 256 });

    expect((await reencode({ bytes, type: "image/jpeg", spec: IMAGE_PURPOSES.avatar })).ok).toBe(
      true,
    );
  });

  it.each([
    ["trop étroite", 255, 300],
    ["trop basse", 300, 255],
  ])("refuse une image %s", async (_name, width, height) => {
    const bytes = await makeImage({ width, height });

    expect(await reencode({ bytes, type: "image/jpeg", spec: IMAGE_PURPOSES.avatar })).toEqual({
      ok: false,
      error: "too_small",
    });
  });

  it.each([5, 6, 7, 8])(
    "applique l'orientation EXIF %i, qui tourne d'un quart, avant de vérifier les dimensions",
    async (orientation) => {
      const bytes = await makeImage({ width: 2400, height: 1000, orientation });

      expect(await reencode({ bytes, type: "image/jpeg", spec: IMAGE_PURPOSES.banner })).toEqual({
        ok: false,
        error: "too_small",
      });
    },
  );

  it.each([2, 3, 4])(
    "garde le sens de l'image pour l'orientation EXIF %i, sans quart de tour",
    async (orientation) => {
      const bytes = await makeImage({ width: 2400, height: 1000, orientation });

      expect((await reencode({ bytes, type: "image/jpeg", spec: IMAGE_PURPOSES.banner })).ok).toBe(
        true,
      );
    },
  );

  it("accepte le plafond de pixels décodés", async () => {
    const bytes = await makeImage({ width: 2000, height: 2000 });

    expect((await reencode({ bytes, type: "image/jpeg", spec: IMAGE_PURPOSES.avatar })).ok).toBe(
      true,
    );
  });

  it("refuse une image au-delà du plafond de pixels décodés", async () => {
    const bytes = await makeImage({ width: 2000, height: 2001, format: "png" });

    expect(await reencode({ bytes, type: "image/png", spec: IMAGE_PURPOSES.avatar })).toEqual({
      ok: false,
      error: "too_many_pixels",
    });
  });

  it("refuse une image dont le format décodé n'est pas le type lu dans les octets", async () => {
    const bytes = await makeImage({ width: 600, height: 600, format: "png" });

    expect(await reencode({ bytes, type: "image/jpeg", spec: IMAGE_PURPOSES.avatar })).toEqual({
      ok: false,
      error: "unsupported_type",
    });
  });

  it("refuse une image dont l'en-tête est illisible", async () => {
    const bytes = (await makeImage({ width: 600, height: 600 })).subarray(0, 4);

    expect(await reencode({ bytes, type: "image/jpeg", spec: IMAGE_PURPOSES.avatar })).toEqual({
      ok: false,
      error: "unsupported_type",
    });
  });

  it("refuse une image dont l'en-tête est lisible mais les pixels tronqués", async () => {
    const image = await makeImage({ width: 600, height: 600, format: "png" });
    const bytes = image.subarray(0, Math.floor(image.length / 2));
    expect((await metadataOf(bytes)).width).toBe(600);

    expect(await reencode({ bytes, type: "image/png", spec: IMAGE_PURPOSES.avatar })).toEqual({
      ok: false,
      error: "unsupported_type",
    });
  });
});
