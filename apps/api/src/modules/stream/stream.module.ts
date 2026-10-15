import { randomUUID } from "node:crypto";

import { type DynamicModule, Inject, Module, type OnModuleDestroy } from "@nestjs/common";

import { receiveProviderWebhook } from "./application/receive-provider-webhook.ts";
import { recordStreamLifecycle } from "./application/record-stream-lifecycle.ts";
import { fakeLiveVideoProvider } from "./infrastructure/fake-live-video-provider.ts";
import {
  prismaStreamSessions,
  type StreamPrisma,
} from "./infrastructure/prisma-stream-sessions.ts";
import {
  RECEIVE_PROVIDER_WEBHOOK,
  VideoWebhookController,
} from "./presentation/video-webhook.controller.ts";

export type { StreamPrisma } from "./infrastructure/prisma-stream-sessions.ts";

const STREAM_PRISMA = Symbol("STREAM_PRISMA");

@Module({})
export class StreamModule implements OnModuleDestroy {
  constructor(@Inject(STREAM_PRISMA) private readonly prisma: StreamPrisma) {}

  static register({
    prisma,
    webhookSecret,
  }: {
    prisma: StreamPrisma;
    webhookSecret: string;
  }): DynamicModule {
    return {
      module: StreamModule,
      controllers: [VideoWebhookController],
      providers: [
        { provide: STREAM_PRISMA, useValue: prisma },
        {
          provide: RECEIVE_PROVIDER_WEBHOOK,
          useValue: receiveProviderWebhook({
            provider: fakeLiveVideoProvider({ webhookSecret }),
            record: recordStreamLifecycle({
              sessions: prismaStreamSessions(prisma),
              newId: randomUUID,
            }),
            now: () => new Date(),
          }),
        },
      ],
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
