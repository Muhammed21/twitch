import { type DynamicModule, Inject, Module, type OnModuleDestroy } from "@nestjs/common";

import type { IdentityPrisma } from "./infrastructure/better-auth.ts";

export {
  createIdentityAuth,
  type IdentityAuth,
  type IdentityPrisma,
} from "./infrastructure/better-auth.ts";

const IDENTITY_PRISMA = Symbol("IDENTITY_PRISMA");

@Module({})
export class IdentityModule implements OnModuleDestroy {
  constructor(@Inject(IDENTITY_PRISMA) private readonly prisma: IdentityPrisma) {}

  static register({ prisma }: { prisma: IdentityPrisma }): DynamicModule {
    return { module: IdentityModule, providers: [{ provide: IDENTITY_PRISMA, useValue: prisma }] };
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
