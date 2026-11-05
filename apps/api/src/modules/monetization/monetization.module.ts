import { randomUUID } from "node:crypto";

import { type DynamicModule, Inject, Module, type OnModuleDestroy } from "@nestjs/common";

import { type LogSink, writeLog } from "../../platform/logging.ts";
import { receiveRevenueCatWebhook } from "./application/receive-revenuecat-webhook.ts";
import {
  type MonetizationPrisma,
  prismaWebhookInbox,
} from "./infrastructure/prisma-webhook-inbox.ts";
import {
  authorizationMatches,
  readRevenueCatWebhook,
} from "./infrastructure/revenuecat-webhook.ts";
import {
  RECEIVE_REVENUECAT_WEBHOOK,
  RevenueCatWebhookController,
} from "./presentation/revenuecat-webhook.controller.ts";

export type { MonetizationPrisma } from "./infrastructure/prisma-webhook-inbox.ts";

const MONETIZATION_DEPENDENCIES = Symbol("MONETIZATION_DEPENDENCIES");

const REVENUECAT = "revenuecat";

type MonetizationDependencies = {
  prisma: MonetizationPrisma;
  webhookAuthorization: string | undefined;
  logSink: LogSink;
};

@Module({})
export class MonetizationModule implements OnModuleDestroy {
  constructor(
    @Inject(MONETIZATION_DEPENDENCIES) private readonly dependencies: MonetizationDependencies,
  ) {}

  static register(dependencies: MonetizationDependencies): DynamicModule {
    const { prisma, webhookAuthorization, logSink } = dependencies;
    return {
      module: MonetizationModule,
      controllers: [RevenueCatWebhookController],
      providers: [
        { provide: MONETIZATION_DEPENDENCIES, useValue: dependencies },
        {
          provide: RECEIVE_REVENUECAT_WEBHOOK,
          useValue: receiveRevenueCatWebhook({
            authenticate:
              webhookAuthorization === undefined
                ? undefined
                : (received) => authorizationMatches({ expected: webhookAuthorization, received }),
            read: readRevenueCatWebhook,
            inbox: prismaWebhookInbox({ prisma, provider: REVENUECAT, newId: randomUUID }),
            alert: (reason) => {
              writeLog(logSink, {
                level: "error",
                msg: "webhook RevenueCat refusé et archivé",
                reason,
              });
            },
          }),
        },
      ],
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.dependencies.prisma.$disconnect();
  }
}
