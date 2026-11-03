import { Controller, Get, Header, Inject, Param } from "@nestjs/common";
import { createZodDto, ZodResponse } from "nestjs-zod";
import { z } from "zod";

import { responses, Uuid } from "@repo/contracts";

import { responseDto } from "../../../openapi/response-dto.ts";
import { ProblemException } from "../../../platform/problem.ts";
import type { GetPlayback, Playback as ChannelPlayback } from "../application/playback.ts";

export const GET_PLAYBACK = Symbol("GET_PLAYBACK");

class Playback extends responseDto(responses.Playback) {}

class PlaybackParams extends createZodDto(z.object({ channelId: Uuid })) {}

@Controller("channels")
export class PlaybackController {
  constructor(@Inject(GET_PLAYBACK) private readonly getPlayback: GetPlayback) {}

  @Get(":channelId/playback")
  @Header("Cache-Control", "no-store")
  @ZodResponse({ status: 200, type: Playback })
  async read(@Param() { channelId }: PlaybackParams): Promise<ChannelPlayback> {
    const playback = await this.getPlayback(channelId);
    if (playback === null) {
      throw new ProblemException({ status: 404, title: "Chaîne hors live" });
    }
    return playback;
  }
}
