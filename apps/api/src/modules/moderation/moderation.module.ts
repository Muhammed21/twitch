import { randomUUID } from "node:crypto";

import { type DynamicModule, Inject, Module, type OnModuleDestroy } from "@nestjs/common";

import { type AuthzRedis, createAuthzContext } from "../../authz/authz-context.ts";
import { timeoutUser } from "./application/timeout-user.ts";
import {
  type ModerationPrisma,
  prismaTimeoutLedger,
} from "./infrastructure/prisma-timeout-ledger.ts";
import { redisSanctionedAssignmentsCache } from "./infrastructure/redis-sanctioned-assignments-cache.ts";
import { TIMEOUT_USER, TimeoutsController } from "./presentation/timeouts.controller.ts";

export type { ModerationPrisma } from "./infrastructure/prisma-timeout-ledger.ts";

const MODERATION_DEPENDENCIES = Symbol("MODERATION_DEPENDENCIES");

type ModerationDependencies = {
  prisma: ModerationPrisma;
  authzRedis: AuthzRedis;
};

@Module({})
export class ModerationModule implements OnModuleDestroy {
  constructor(
    @Inject(MODERATION_DEPENDENCIES) private readonly dependencies: ModerationDependencies,
  ) {}

  static register(dependencies: ModerationDependencies): DynamicModule {
    const { prisma, authzRedis } = dependencies;
    return {
      module: ModerationModule,
      controllers: [TimeoutsController],
      providers: [
        { provide: MODERATION_DEPENDENCIES, useValue: dependencies },
        {
          provide: TIMEOUT_USER,
          useValue: timeoutUser({
            authz: createAuthzContext({ prisma, redis: authzRedis, now: () => new Date() }),
            ledger: prismaTimeoutLedger(prisma),
            cache: redisSanctionedAssignmentsCache(authzRedis),
            newId: randomUUID,
            now: () => new Date(),
          }),
        },
      ],
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.dependencies.prisma.$disconnect();
  }
}
