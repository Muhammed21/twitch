import { Uuid } from "@repo/contracts";
import { err, ok, type Result } from "@repo/result";

import { IMAGE_PURPOSES, type ImagePurpose, type ImagePurposeSpec } from "./image-purposes.ts";
import { incomingKey, type ImageStorage, servedKey } from "./image-storage.ts";
import { type ImageType, sniffImageType } from "./image-type.ts";

export type ReencodeRejection = "unsupported_type" | "too_small" | "too_many_pixels";

export type ImageReencoder = (request: {
  bytes: Uint8Array;
  type: ImageType;
  spec: ImagePurposeSpec;
}) => Promise<Result<Uint8Array, ReencodeRejection>>;

export type ImageRejection = "upload_not_found" | "too_large" | ReencodeRejection;

export type FinalizedImage = { readonly key: string; readonly url: string };

export type FinalizeImage = (request: {
  uploadId: string;
  purpose: ImagePurpose;
  userId: string;
}) => Promise<Result<FinalizedImage, ImageRejection>>;

const SERVED_CACHE_CONTROL = "public, max-age=31536000, immutable";

export const imageUrlOf =
  (publicBaseUrl: string) =>
  (key: string): string =>
    `${publicBaseUrl.replace(/\/$/, "")}/${key}`;

export const finalizeImage = ({
  storage,
  reencode,
  newImageId,
  publicBaseUrl,
}: {
  storage: ImageStorage;
  reencode: ImageReencoder;
  newImageId: () => string;
  publicBaseUrl: string;
}): FinalizeImage => {
  const urlOf = imageUrlOf(publicBaseUrl);
  const reencodeDeposit = async (
    bytes: Uint8Array,
    purpose: ImagePurpose,
  ): Promise<Result<Uint8Array, ReencodeRejection>> => {
    const type = sniffImageType(bytes);
    return type === undefined
      ? err("unsupported_type")
      : reencode({ bytes, type, spec: IMAGE_PURPOSES[purpose] });
  };
  const reject = async (deposit: string, rejection: ImageRejection) => {
    await storage.delete(deposit);
    return err(rejection);
  };
  return async ({ uploadId, purpose, userId }) => {
    if (!Uuid.safeParse(uploadId).success) {
      return err("upload_not_found");
    }
    const deposit = incomingKey({ userId, purpose, uploadId });
    const stored = await storage.read({ key: deposit, maxBytes: IMAGE_PURPOSES[purpose].maxBytes });
    if (stored.kind === "missing") {
      return err("upload_not_found");
    }
    if (stored.kind === "too_large") {
      return reject(deposit, "too_large");
    }
    const reencoded = await reencodeDeposit(stored.bytes, purpose);
    if (!reencoded.ok) {
      return reject(deposit, reencoded.error);
    }
    const key = servedKey({ purpose, imageId: newImageId() });
    await storage.write({
      key,
      bytes: reencoded.value,
      contentType: "image/webp",
      cacheControl: SERVED_CACHE_CONTROL,
    });
    await storage.delete(deposit);
    return ok({ key, url: urlOf(key) });
  };
};
