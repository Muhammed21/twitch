import { type DynamicModule, Inject, Module, type OnModuleDestroy } from "@nestjs/common";

import { getCurrentAccount } from "./application/get-current-account.ts";
import type { IdentityPrisma } from "./infrastructure/better-auth.ts";
import { prismaAccountDirectory } from "./infrastructure/prisma-account-directory.ts";
import type { IdentityRedis } from "./infrastructure/redis-session-revocation.ts";
import { GET_CURRENT_ACCOUNT, MeController } from "./presentation/me.controller.ts";
export {
  createIdentityRedis,
  type IdentityRedis,
} from "./infrastructure/redis-session-revocation.ts";
export { mountIdentityRoutes } from "./infrastructure/routes.ts";
export { createIdentityAccessTokenVerifier } from "./infrastructure/access-token-verifier.ts";

export {
  createIdentityAuth,
  type IdentityAuth,
  type IdentityPrisma,
} from "./infrastructure/better-auth.ts";

const IDENTITY_PRISMA = Symbol("IDENTITY_PRISMA");
const IDENTITY_REDIS = Symbol("IDENTITY_REDIS");

@Module({})
export class IdentityModule implements OnModuleDestroy {
  constructor(
    @Inject(IDENTITY_PRISMA) private readonly prisma: IdentityPrisma,
    @Inject(IDENTITY_REDIS) private readonly redis: IdentityRedis,
  ) {}

  static register({
    prisma,
    redis,
  }: {
    prisma: IdentityPrisma;
    redis: IdentityRedis;
  }): DynamicModule {
    return {
      module: IdentityModule,
      controllers: [MeController],
      providers: [
        {
          provide: GET_CURRENT_ACCOUNT,
          useValue: getCurrentAccount(prismaAccountDirectory(prisma)),
        },
        { provide: IDENTITY_PRISMA, useValue: prisma },
        { provide: IDENTITY_REDIS, useValue: redis },
      ],
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
    if (this.redis.isOpen) {
      this.redis.destroy();
    }
  }
}
