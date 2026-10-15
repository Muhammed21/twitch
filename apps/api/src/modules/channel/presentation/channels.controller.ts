import { Body, Controller, Get, Inject, Param, Patch, UseGuards } from "@nestjs/common";
import { createZodDto, ZodResponse } from "nestjs-zod";
import { z } from "zod";

import type { AccessTokenIdentity } from "@repo/auth-verifier";
import { responses, Uuid } from "@repo/contracts";
import type { Result } from "@repo/result";

import { responseDto } from "../../../openapi/response-dto.ts";
import { AccessTokenGuard, CurrentIdentity } from "../../../platform/authentication.ts";
import { ProblemException } from "../../../platform/problem.ts";
import type { ChannelView, TitleUpdateError } from "../application/channel-queries.ts";
import { MAX_TITLE_LENGTH } from "../domain/channel-title.ts";

export const GET_CHANNEL = Symbol("GET_CHANNEL");
export const UPDATE_CHANNEL_TITLE = Symbol("UPDATE_CHANNEL_TITLE");

export type GetChannel = (slug: string) => Promise<Result<ChannelView, "channel_not_found">>;

export type UpdateChannelTitle = (request: {
  actorId: string;
  channelId: string;
  title: string;
}) => Promise<Result<ChannelView, TitleUpdateError>>;

class Channel extends responseDto(responses.Channel) {}

class UpdateChannelRequest extends createZodDto(z.strictObject({ title: z.string() })) {}

const channelNotFound = () => new ProblemException({ status: 404, title: "Chaîne introuvable" });

const PROBLEMS: Readonly<Record<TitleUpdateError, () => ProblemException>> = {
  channel_not_found: channelNotFound,
  forbidden: () => new ProblemException({ status: 403, title: "Action non autorisée" }),
  title_too_long: () =>
    new ProblemException({
      status: 422,
      title: "Titre invalide",
      detail: `Le titre compte au plus ${MAX_TITLE_LENGTH} caractères.`,
    }),
};

@Controller("channels")
export class ChannelsController {
  constructor(
    @Inject(GET_CHANNEL) private readonly getChannel: GetChannel,
    @Inject(UPDATE_CHANNEL_TITLE) private readonly updateTitle: UpdateChannelTitle,
  ) {}

  @Get(":slug")
  @ZodResponse({ status: 200, type: Channel })
  async read(@Param("slug") slug: string): Promise<ChannelView> {
    const found = await this.getChannel(slug);
    if (!found.ok) {
      throw channelNotFound();
    }
    return found.value;
  }

  @Patch(":id")
  @UseGuards(AccessTokenGuard)
  @ZodResponse({ status: 200, type: Channel })
  async update(
    @Param("id") id: string,
    @Body() body: UpdateChannelRequest,
    @CurrentIdentity() identity: AccessTokenIdentity,
  ): Promise<ChannelView> {
    if (!Uuid.safeParse(id).success) {
      throw channelNotFound();
    }
    const updated = await this.updateTitle({
      actorId: identity.userId,
      channelId: id,
      title: body.title,
    });
    if (!updated.ok) {
      throw PROBLEMS[updated.error]();
    }
    return updated.value;
  }
}
