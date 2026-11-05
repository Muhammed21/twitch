import { Body, Controller, Inject, Put, UseGuards } from "@nestjs/common";
import { createZodDto, ZodResponse } from "nestjs-zod";
import { z } from "zod";

import type { AccessTokenIdentity } from "@repo/auth-verifier";
import { Uuid } from "@repo/contracts";
import type { Result } from "@repo/result";

import { AccessTokenGuard, CurrentIdentity } from "../../../platform/authentication.ts";
import { imageRejected } from "../../../platform/images/image-problems.ts";
import type { BannerChangeError } from "../application/change-banner.ts";
import type { ChannelView } from "../application/channel-queries.ts";
import {
  CHANNEL_IMAGE_URL,
  Channel,
  channelNotFound,
  type ChannelResponse,
  type ImageUrlOf,
  presentChannel,
} from "./channels.controller.ts";

export const CHANGE_BANNER = Symbol("CHANGE_BANNER");

export type ChangeBanner = (change: {
  userId: string;
  uploadId: string;
}) => Promise<Result<ChannelView, BannerChangeError>>;

class BannerUploadRequest extends createZodDto(z.strictObject({ uploadId: Uuid })) {}

const bannerProblem = (error: BannerChangeError): Error =>
  error === "channel_not_found"
    ? channelNotFound()
    : imageRejected({ rejection: error, purpose: "banner" });

@Controller("me")
@UseGuards(AccessTokenGuard)
export class MeBannerController {
  constructor(
    @Inject(CHANGE_BANNER) private readonly changeBanner: ChangeBanner,
    @Inject(CHANNEL_IMAGE_URL) private readonly imageUrlOf: ImageUrlOf,
  ) {}

  @Put("banner")
  @ZodResponse({ status: 200, type: Channel })
  async banner(
    @Body() body: BannerUploadRequest,
    @CurrentIdentity() identity: AccessTokenIdentity,
  ): Promise<ChannelResponse> {
    const changed = await this.changeBanner({ userId: identity.userId, uploadId: body.uploadId });
    if (!changed.ok) {
      throw bannerProblem(changed.error);
    }
    return presentChannel(this.imageUrlOf)(changed.value);
  }
}
