import { Controller, Get, Inject, type OnModuleDestroy, Param, Req, Res } from "@nestjs/common";
import { ApiExtraModels, ApiOkResponse, ApiProduces } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { responses } from "@repo/contracts";

import { responseDto } from "../../../openapi/response-dto.ts";
import { PathChannelId } from "../../../platform/channel-id.ts";
import { ProblemException } from "../../../platform/problem.ts";
import type { ChannelLiveStatus, LiveStatusHub } from "../application/live-status-hub.ts";

export const LIVE_STATUS_HUB = Symbol("LIVE_STATUS_HUB");
export const LIVE_STATUS_HEARTBEAT_MS = Symbol("LIVE_STATUS_HEARTBEAT_MS");

const SSE_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache",
  "x-accel-buffering": "no",
};

class LiveStatus extends responseDto(responses.LiveStatus) {}

class LiveStatusParams extends createZodDto(z.object({ channelId: PathChannelId })) {}

const toLiveStatus = ({
  channelId,
  startedAt,
  viewerCount,
}: ChannelLiveStatus): z.input<typeof responses.LiveStatus> =>
  startedAt === undefined
    ? { channelId, live: false }
    : { channelId, live: true, startedAt: startedAt.toISOString(), viewerCount };

@Controller("channels")
@ApiExtraModels(LiveStatus)
export class LiveStatusController implements OnModuleDestroy {
  readonly #open = new Set<Response>();

  constructor(
    @Inject(LIVE_STATUS_HUB) private readonly hub: LiveStatusHub,
    @Inject(LIVE_STATUS_HEARTBEAT_MS) private readonly heartbeatMs: number,
  ) {}

  @Get(":channelId/live-status")
  @ApiProduces("text/event-stream")
  @ApiOkResponse({
    content: { "text/event-stream": { schema: { $ref: "#/components/schemas/LiveStatus" } } },
  })
  async stream(
    @Param() { channelId }: LiveStatusParams,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const subscription = await this.hub.subscribe(channelId, (status) => {
      if (!response.headersSent) {
        response.writeHead(200, SSE_HEADERS);
      }
      response.write(`event: status\ndata: ${JSON.stringify(toLiveStatus(status))}\n\n`);
    });
    if (!subscription.ok) {
      throw new ProblemException({ status: 404, title: "Chaîne introuvable" });
    }
    if (request.destroyed) {
      subscription.value();
      return;
    }
    const heartbeat = setInterval(() => response.write(": ping\n\n"), this.heartbeatMs);
    this.#open.add(response);
    request.on("close", () => {
      clearInterval(heartbeat);
      subscription.value();
      this.#open.delete(response);
    });
  }

  onModuleDestroy(): void {
    this.#open.forEach((response) => response.end());
  }
}
