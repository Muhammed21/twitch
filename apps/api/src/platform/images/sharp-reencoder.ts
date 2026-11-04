import sharp, { type Metadata } from "sharp";

import { err, ok, type Result } from "@repo/result";

import type { ImageReencoder } from "./finalize-image.ts";
import type { ImageType } from "./image-type.ts";

const SHARP_FORMAT: Readonly<Record<ImageType, string>> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};

const swapsAxes = (orientation: number | undefined) => (orientation ?? 1) >= 5;

const readHeader = async (bytes: Uint8Array): Promise<Result<Metadata, "unsupported_type">> => {
  try {
    return ok(await sharp(bytes).metadata());
  } catch {
    return err("unsupported_type");
  }
};

const encode = async (
  bytes: Uint8Array,
  { maxInputPixels, width, height }: { maxInputPixels: number; width: number; height: number },
): Promise<Result<Uint8Array, "unsupported_type">> => {
  try {
    const output = await sharp(bytes, { limitInputPixels: maxInputPixels })
      .rotate()
      .resize(width, height)
      .webp()
      .toBuffer();
    return ok(new Uint8Array(output));
  } catch {
    return err("unsupported_type");
  }
};

export const sharpReencoder =
  ({ maxInputPixels }: { maxInputPixels: number }): ImageReencoder =>
  async ({ bytes, type, spec }) => {
    const header = await readHeader(bytes);
    if (!header.ok) {
      return header;
    }
    if (header.value.format !== SHARP_FORMAT[type]) {
      return err("unsupported_type");
    }
    const { width, height, orientation } = header.value;
    if (width * height > maxInputPixels) {
      return err("too_many_pixels");
    }
    const [shownWidth, shownHeight] = swapsAxes(orientation) ? [height, width] : [width, height];
    if (shownWidth < spec.minWidth || shownHeight < spec.minHeight) {
      return err("too_small");
    }
    return encode(bytes, { maxInputPixels, width: spec.outputWidth, height: spec.outputHeight });
  };
