import { Body, Controller, Get, Inject, Patch, Put, UseGuards } from "@nestjs/common";
import { createZodDto, ZodResponse } from "nestjs-zod";
import { z } from "zod";

import type { AccessTokenIdentity } from "@repo/auth-verifier";
import { responses, Uuid } from "@repo/contracts";
import type { Result } from "@repo/result";

import { responseDto } from "../../../openapi/response-dto.ts";
import {
  AccessTokenGuard,
  CurrentIdentity,
  invalidToken,
} from "../../../platform/authentication.ts";
import { imageRejected } from "../../../platform/images/image-problems.ts";
import { ProblemException } from "../../../platform/problem.ts";
import type { AvatarChangeError } from "../application/change-avatar.ts";
import type { BioChangeError } from "../application/change-bio.ts";
import type { Account } from "../application/get-current-account.ts";
import { MAX_BIO_LENGTH } from "../domain/profile-bio.ts";

export const GET_CURRENT_ACCOUNT = Symbol("GET_CURRENT_ACCOUNT");
export const CHANGE_BIO = Symbol("CHANGE_BIO");
export const CHANGE_AVATAR = Symbol("CHANGE_AVATAR");

export type GetCurrentAccount = (userId: string) => Promise<Result<Account, "account_not_found">>;

export type ChangeBio = (change: {
  userId: string;
  bio: string;
}) => Promise<Result<void, BioChangeError>>;

export type ChangeAvatar = (change: {
  userId: string;
  uploadId: string;
}) => Promise<Result<void, AvatarChangeError>>;

class Me extends responseDto(responses.Me) {}

class AvatarUploadRequest extends createZodDto(z.strictObject({ uploadId: Uuid })) {}

class UpdateMeRequest extends createZodDto(
  z.strictObject({
    bio: z.string().meta({
      description: `Au plus ${MAX_BIO_LENGTH} caractères, espaces des bords retirés ; une bio vide efface la bio.`,
    }),
  }),
) {}

const PROBLEMS: Readonly<Record<BioChangeError, () => Error>> = {
  account_not_found: invalidToken,
  bio_too_long: () =>
    new ProblemException({
      status: 422,
      title: "Bio invalide",
      detail: `La bio compte au plus ${MAX_BIO_LENGTH} caractères.`,
    }),
};

const toMe = ({ lastLiveAt, ...account }: Account): z.input<typeof responses.Me> =>
  lastLiveAt === undefined ? account : { ...account, lastLiveAt: lastLiveAt.toISOString() };

const avatarProblem = (error: AvatarChangeError): Error =>
  error === "account_not_found"
    ? invalidToken()
    : imageRejected({ rejection: error, purpose: "avatar" });

@Controller("me")
@UseGuards(AccessTokenGuard)
export class MeController {
  constructor(
    @Inject(GET_CURRENT_ACCOUNT) private readonly currentAccount: GetCurrentAccount,
    @Inject(CHANGE_BIO) private readonly changeBio: ChangeBio,
    @Inject(CHANGE_AVATAR) private readonly changeAvatar: ChangeAvatar,
  ) {}

  @Get()
  @ZodResponse({ status: 200, type: Me })
  async read(
    @CurrentIdentity() identity: AccessTokenIdentity,
  ): Promise<z.input<typeof responses.Me>> {
    const account = await this.currentAccount(identity.userId);
    if (!account.ok) {
      throw invalidToken();
    }
    return toMe(account.value);
  }

  @Patch()
  @ZodResponse({ status: 200, type: Me })
  async update(
    @Body() body: UpdateMeRequest,
    @CurrentIdentity() identity: AccessTokenIdentity,
  ): Promise<z.input<typeof responses.Me>> {
    const changed = await this.changeBio({ userId: identity.userId, bio: body.bio });
    if (!changed.ok) {
      throw PROBLEMS[changed.error]();
    }
    return this.read(identity);
  }

  @Put("avatar")
  @ZodResponse({ status: 200, type: Me })
  async avatar(
    @Body() body: AvatarUploadRequest,
    @CurrentIdentity() identity: AccessTokenIdentity,
  ): Promise<z.input<typeof responses.Me>> {
    const changed = await this.changeAvatar({ userId: identity.userId, uploadId: body.uploadId });
    if (!changed.ok) {
      throw avatarProblem(changed.error);
    }
    return this.read(identity);
  }
}
