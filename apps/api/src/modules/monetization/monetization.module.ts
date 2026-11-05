import { randomUUID } from "node:crypto";

import {
  type DynamicModule,
  Inject,
  Module,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";

import { errorDetails, type LogSink, writeLog } from "../../platform/logging.ts";
import { startPeriodicJob } from "../../platform/periodic-job.ts";
import type { WindowCounter } from "../../platform/rate-limit.ts";
import { type ProcessWebhook, processWebhook } from "./application/process-webhook.ts";
import { receiveRevenueCatWebhook } from "./application/receive-revenuecat-webhook.ts";
import { syncTurboEntitlement } from "./application/sync-turbo-entitlement.ts";
import { prismaActiveEntitlements } from "./infrastructure/prisma-active-entitlements.ts";
import { prismaTurboLedger } from "./infrastructure/prisma-turbo-ledger.ts";
import {
  type MonetizationPrisma,
  prismaWebhookInbox,
} from "./infrastructure/prisma-webhook-inbox.ts";
import { prismaWebhookQueue, type WebhookQueue } from "./infrastructure/prisma-webhook-queue.ts";
import { translateRevenueCatEvent } from "./infrastructure/revenuecat-events.ts";
import {
  revenueCatSubscriberSource,
  type RevenueCatFetch,
} from "./infrastructure/revenuecat-subscriber-source.ts";
import {
  authorizationMatches,
  readRevenueCatWebhook,
} from "./infrastructure/revenuecat-webhook.ts";
import { entitlementsSyncRateLimit } from "./presentation/entitlements-sync-rate-limit.ts";
import {
  ENTITLEMENTS_SYNC_RATE_LIMIT,
  EntitlementsSyncController,
  READ_ACTIVE_ENTITLEMENTS,
  SYNC_TURBO_ENTITLEMENT,
} from "./presentation/entitlements-sync.controller.ts";
import {
  RECEIVE_REVENUECAT_WEBHOOK,
  RevenueCatWebhookController,
} from "./presentation/revenuecat-webhook.controller.ts";

export type { MonetizationPrisma } from "./infrastructure/prisma-webhook-inbox.ts";
export { prismaActiveEntitlements as createActiveEntitlementsReader } from "./infrastructure/prisma-active-entitlements.ts";

const MONETIZATION_DEPENDENCIES = Symbol("MONETIZATION_DEPENDENCIES");

const REVENUECAT = "revenuecat";
const WEBHOOK_PROCESSING_INTERVAL_MS = 1000;
const WEBHOOKS_PER_PASS = 50;

type MonetizationDependencies = {
  prisma: MonetizationPrisma;
  webhookAuthorization: string | undefined;
  secretApiKey: string | undefined;
  counter: WindowCounter;
  logSink: LogSink;
  revenueCatFetch?: RevenueCatFetch;
  webhookProcessingIntervalMs?: number;
};

const drain = async ({
  queue,
  work,
  logSink,
  remaining,
}: {
  queue: WebhookQueue;
  work: ProcessWebhook;
  logSink: LogSink;
  remaining: number;
}): Promise<void> => {
  if (remaining === 0) {
    return;
  }
  const result = await queue.processNext(work, new Date());
  if (result.status === "empty") {
    return;
  }
  if (result.status === "failed") {
    writeLog(logSink, {
      level: "error",
      msg: "traitement d'un webhook RevenueCat en échec, reprogrammé",
      eventId: result.eventId,
      error: result.error,
    });
  }
  await drain({ queue, work, logSink, remaining: remaining - 1 });
};

@Module({})
export class MonetizationModule implements OnModuleInit, OnModuleDestroy {
  #processing: { stop: () => Promise<void> } | undefined;

  constructor(
    @Inject(MONETIZATION_DEPENDENCIES) private readonly dependencies: MonetizationDependencies,
  ) {}

  static register(dependencies: MonetizationDependencies): DynamicModule {
    const { prisma, webhookAuthorization, secretApiKey, counter, logSink, revenueCatFetch } =
      dependencies;
    return {
      module: MonetizationModule,
      controllers: [RevenueCatWebhookController, EntitlementsSyncController],
      providers: [
        { provide: MONETIZATION_DEPENDENCIES, useValue: dependencies },
        {
          provide: SYNC_TURBO_ENTITLEMENT,
          useValue:
            secretApiKey === undefined
              ? undefined
              : syncTurboEntitlement({
                  observe: revenueCatSubscriberSource({
                    apiKey: secretApiKey,
                    ...(revenueCatFetch === undefined ? {} : { fetch: revenueCatFetch }),
                  }),
                  transact: (work) => prisma.$transaction((tx) => work(prismaTurboLedger(tx))),
                  newId: randomUUID,
                }),
        },
        { provide: READ_ACTIVE_ENTITLEMENTS, useValue: prismaActiveEntitlements({ prisma }) },
        {
          provide: ENTITLEMENTS_SYNC_RATE_LIMIT,
          useValue: entitlementsSyncRateLimit({ counter, now: () => new Date() }),
        },
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

  onModuleInit(): void {
    const {
      prisma,
      logSink,
      webhookProcessingIntervalMs = WEBHOOK_PROCESSING_INTERVAL_MS,
    } = this.dependencies;
    const queue = prismaWebhookQueue({ prisma, provider: REVENUECAT });
    const work = processWebhook({
      translate: translateRevenueCatEvent,
      newId: randomUUID,
      alert: ({ eventId, reason }) => {
        writeLog(logSink, {
          level: "error",
          msg: "événement RevenueCat ignoré",
          eventId,
          reason,
        });
      },
    });
    this.#processing = startPeriodicJob({
      intervalMs: webhookProcessingIntervalMs,
      run: () => drain({ queue, work, logSink, remaining: WEBHOOKS_PER_PASS }),
      onError: (error) =>
        writeLog(logSink, {
          level: "error",
          msg: "traitement des webhooks RevenueCat en échec",
          ...errorDetails(error),
        }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.#processing?.stop();
    await this.dependencies.prisma.$disconnect();
  }
}
