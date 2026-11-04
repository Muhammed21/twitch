import { Body, Controller, Get, Inject, Param, Patch, UseGuards } from "@nestjs/common";
import { createZodDto, ZodResponse } from "nestjs-zod";
import { z } from "zod";

import type { AccessTokenIdentity } from "@repo/auth-verifier";
import { responses, Uuid } from "@repo/contracts";
import type { Result } from "@repo/result";

import { responseDto } from "../../../openapi/response-dto.ts";
import { AccessTokenGuard, CurrentIdentity } from "../../../platform/authentication.ts";
import { pathChannelIdOf } from "../../../platform/channel-id.ts";
import { ProblemException } from "../../../platform/problem.ts";
import type {
  ChannelUpdate,
  ChannelUpdateError,
  ChannelView,
} from "../application/channel-queries.ts";
import { MAX_TITLE_LENGTH } from "../domain/channel-title.ts";

export const GET_CHANNEL = Symbol("GET_CHANNEL");
export const UPDATE_CHANNEL = Symbol("UPDATE_CHANNEL");

export type GetChannel = (slug: string) => Promise<Result<ChannelView, "channel_not_found">>;

export type UpdateChannel = (
  request: ChannelUpdate,
) => Promise<Result<ChannelView, ChannelUpdateError>>;

class Channel extends responseDto(responses.Channel) {}

const CategoryChoice = z
  .strictObject({ id: Uuid.transform((id) => id.toLowerCase()).optional() })
  .meta({ id: "CategoryChoice" });

class UpdateChannelRequest extends createZodDto(
  z
    .strictObject({ title: z.string().optional(), category: CategoryChoice.optional() })
    .refine((body) => body.title !== undefined || body.category !== undefined, {
      message: "Le corps change le titre, la catégorie, ou les deux.",
    }),
) {}

type ChannelResponse = z.input<typeof responses.Channel>;

const toResponse = ({ category, ...channel }: ChannelView): ChannelResponse =>
  category === null ? channel : { ...channel, category };

const channelNotFound = () => new ProblemException({ status: 404, title: "Chaîne introuvable" });

const PROBLEMS: Readonly<Record<ChannelUpdateError, () => ProblemException>> = {
  channel_not_found: channelNotFound,
  forbidden: () => new ProblemException({ status: 403, title: "Action non autorisée" }),
  title_too_long: () =>
    new ProblemException({
      status: 422,
      title: "Titre invalide",
      detail: `Le titre compte au plus ${MAX_TITLE_LENGTH} caractères.`,
    }),
  category_unavailable: () =>
    new ProblemException({
      status: 422,
      title: "Catégorie invalide",
      detail: "La catégorie n'existe pas, ou elle a été fusionnée ou retirée.",
    }),
};

@Controller("channels")
export class ChannelsController {
  constructor(
    @Inject(GET_CHANNEL) private readonly getChannel: GetChannel,
    @Inject(UPDATE_CHANNEL) private readonly updateChannel: UpdateChannel,
  ) {}

  @Get(":slug")
  @ZodResponse({ status: 200, type: Channel })
  async read(@Param("slug") slug: string): Promise<ChannelResponse> {
    const found = await this.getChannel(slug);
    if (!found.ok) {
      throw channelNotFound();
    }
    return toResponse(found.value);
  }

  @Patch(":id")
  @UseGuards(AccessTokenGuard)
  @ZodResponse({ status: 200, type: Channel })
  async update(
    @Param("id") id: string,
    @Body() body: UpdateChannelRequest,
    @CurrentIdentity() identity: AccessTokenIdentity,
  ): Promise<ChannelResponse> {
    const channelId = pathChannelIdOf(id);
    if (channelId === undefined) {
      throw channelNotFound();
    }
    const updated = await this.updateChannel({
      actorId: identity.userId,
      channelId,
      title: body.title,
      categoryId: body.category === undefined ? undefined : (body.category.id ?? null),
    });
    if (!updated.ok) {
      throw PROBLEMS[updated.error]();
    }
    return toResponse(updated.value);
  }
}
