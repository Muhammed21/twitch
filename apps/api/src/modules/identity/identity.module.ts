import { type DynamicModule, Inject, Module, type OnModuleDestroy } from "@nestjs/common";

import type { ImageBrick } from "../../platform/images/images.module.ts";
import { errorDetails, type LogSink, writeLog } from "../../platform/logging.ts";
import { changeAvatar } from "./application/change-avatar.ts";
import { changeBio } from "./application/change-bio.ts";
import { getCurrentAccount, type LastLiveOf } from "./application/get-current-account.ts";
import type { IdentityPrisma } from "./infrastructure/better-auth.ts";
import {
  prismaAccountDirectory,
  prismaAvatarStore,
  prismaBioStore,
} from "./infrastructure/prisma-account-directory.ts";
import type { IdentityRedis } from "./infrastructure/redis-session-revocation.ts";
import {
  CHANGE_AVATAR,
  CHANGE_BIO,
  GET_CURRENT_ACCOUNT,
  MeController,
} from "./presentation/me.controller.ts";
export {
  createIdentityRedis,
  type IdentityRedis,
} from "./infrastructure/redis-session-revocation.ts";
export { mountIdentityRoutes } from "./infrastructure/routes.ts";
export { mountAuthPages } from "./infrastructure/pages/pages-routes.ts";
export { createIdentityAccessTokenVerifier } from "./infrastructure/access-token-verifier.ts";

export {
  createIdentityAuth,
  type IdentityAuth,
  type IdentityPrisma,
} from "./infrastructure/better-auth.ts";

export type { LastLiveOf } from "./application/get-current-account.ts";

export const createCurrentAccountReader = ({
  prisma,
  lastLiveOf,
  imageUrlOf,
}: {
  prisma: IdentityPrisma;
  lastLiveOf: LastLiveOf;
  imageUrlOf: (key: string) => string;
}) => getCurrentAccount({ directory: prismaAccountDirectory(prisma), lastLiveOf, imageUrlOf });

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
    lastLiveOf,
    images,
    logSink,
  }: {
    prisma: IdentityPrisma;
    redis: IdentityRedis;
    lastLiveOf: LastLiveOf;
    images: Pick<ImageBrick, "finalizeImage" | "imageUrlOf" | "storage">;
    logSink: LogSink;
  }): DynamicModule {
    return {
      module: IdentityModule,
      controllers: [MeController],
      providers: [
        {
          provide: GET_CURRENT_ACCOUNT,
          useValue: createCurrentAccountReader({
            prisma,
            lastLiveOf,
            imageUrlOf: images.imageUrlOf,
          }),
        },
        { provide: CHANGE_BIO, useValue: changeBio(prismaBioStore(prisma)) },
        {
          provide: CHANGE_AVATAR,
          useValue: changeAvatar({
            store: prismaAvatarStore(prisma),
            finalizeImage: images.finalizeImage,
            discardImage: (key) => images.storage.delete(key),
            onDiscardFailure: ({ imageKey, error }) =>
              writeLog(logSink, {
                level: "error",
                msg: "suppression d'une image d'avatar en échec",
                imageKey,
                ...errorDetails(error),
              }),
          }),
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
