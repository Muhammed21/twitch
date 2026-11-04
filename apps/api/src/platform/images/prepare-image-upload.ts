import { err, ok, type Result } from "@repo/result";

import { IMAGE_PURPOSES, type ImagePurpose } from "./image-purposes.ts";
import { incomingKey, type ImageStorage } from "./image-storage.ts";
import { IMAGE_TYPES } from "./image-type.ts";

export const UPLOAD_VALIDITY_SECONDS = 300;

export type PreparedUpload = {
  readonly uploadId: string;
  readonly uploadUrl: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly expiresAt: Date;
};

export type UploadPreparationError = "unsupported_type" | "too_large";

const isAcceptedType = (contentType: string) =>
  IMAGE_TYPES.some((accepted) => accepted === contentType);

export const prepareImageUpload =
  ({
    storage,
    newUploadId,
    now,
  }: {
    storage: ImageStorage;
    newUploadId: () => string;
    now: () => Date;
  }) =>
  async ({
    userId,
    purpose,
    contentType,
    byteSize,
  }: {
    userId: string;
    purpose: ImagePurpose;
    contentType: string;
    byteSize: number;
  }): Promise<Result<PreparedUpload, UploadPreparationError>> => {
    if (!isAcceptedType(contentType)) {
      return err("unsupported_type");
    }
    if (byteSize > IMAGE_PURPOSES[purpose].maxBytes) {
      return err("too_large");
    }
    const uploadId = newUploadId();
    const uploadUrl = await storage.presignPut({
      key: incomingKey({ userId, purpose, uploadId }),
      contentType,
      contentLength: byteSize,
      expiresInSeconds: UPLOAD_VALIDITY_SECONDS,
    });
    return ok({
      uploadId,
      uploadUrl,
      headers: { "Content-Type": contentType, "Content-Length": String(byteSize) },
      expiresAt: new Date(now().getTime() + UPLOAD_VALIDITY_SECONDS * 1000),
    });
  };
