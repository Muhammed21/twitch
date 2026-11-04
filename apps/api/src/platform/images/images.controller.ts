import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import { createZodDto, ZodResponse } from "nestjs-zod";
import { z } from "zod";

import type { AccessTokenIdentity } from "@repo/auth-verifier";
import { responses } from "@repo/contracts";
import type { Result } from "@repo/result";

import { responseDto } from "../../openapi/response-dto.ts";
import { AccessTokenGuard, CurrentIdentity } from "../authentication.ts";
import { type RateDecision, tooManyRequests } from "../rate-limit.ts";
import { imageRejected } from "./image-problems.ts";
import { IMAGE_PURPOSE_NAMES, type ImagePurpose } from "./image-purposes.ts";
import type { PreparedUpload, UploadPreparationError } from "./prepare-image-upload.ts";

export const PREPARE_IMAGE_UPLOAD = Symbol("PREPARE_IMAGE_UPLOAD");
export const IMAGE_UPLOAD_RATE_LIMIT = Symbol("IMAGE_UPLOAD_RATE_LIMIT");

export type PrepareUpload = (request: {
  userId: string;
  purpose: ImagePurpose;
  contentType: string;
  byteSize: number;
}) => Promise<Result<PreparedUpload, UploadPreparationError>>;

export type ImageUploadRateLimit = (userId: string) => Promise<RateDecision>;

class ImageUpload extends responseDto(responses.ImageUpload) {}

class PrepareImageUploadRequest extends createZodDto(
  z.strictObject({
    purpose: z.enum(IMAGE_PURPOSE_NAMES),
    contentType: z.string().meta({
      description: "image/jpeg, image/png ou image/webp ; tout autre type est refusé en 422.",
    }),
    byteSize: z.int().min(1),
  }),
) {}

@Controller("images")
@UseGuards(AccessTokenGuard)
export class ImagesController {
  constructor(
    @Inject(PREPARE_IMAGE_UPLOAD) private readonly prepare: PrepareUpload,
    @Inject(IMAGE_UPLOAD_RATE_LIMIT) private readonly rateLimit: ImageUploadRateLimit,
  ) {}

  @Post("uploads")
  @ZodResponse({ status: 201, type: ImageUpload })
  async prepareUpload(
    @Body() body: PrepareImageUploadRequest,
    @CurrentIdentity() identity: AccessTokenIdentity,
  ): Promise<z.input<typeof responses.ImageUpload>> {
    const decision = await this.rateLimit(identity.userId);
    if (!decision.allowed) {
      throw tooManyRequests(decision.retryAfterSeconds);
    }
    const prepared = await this.prepare({
      userId: identity.userId,
      purpose: body.purpose,
      contentType: body.contentType,
      byteSize: body.byteSize,
    });
    if (!prepared.ok) {
      throw imageRejected({ rejection: prepared.error, purpose: body.purpose });
    }
    return { ...prepared.value, expiresAt: prepared.value.expiresAt.toISOString() };
  }
}
