import { type DynamicModule, Inject, Module, type OnModuleDestroy } from "@nestjs/common";

import type { IdentityPrisma } from "./infrastructure/better-auth.ts";
import type { IdentityRedis } from "./infrastructure/redis-session-revocation.ts";
export {
  createIdentityRedis,
  type IdentityRedis,
} from "./infrastructure/redis-session-revocation.ts";
export { mountIdentityRoutes } from "./infrastructure/routes.ts";

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
      providers: [
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
