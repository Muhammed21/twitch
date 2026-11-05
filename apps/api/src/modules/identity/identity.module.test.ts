import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import { createContextClient } from "@repo/db";

import { rejectingVerifier } from "../../platform/authentication.ts";
import { createImageBrick } from "../../platform/images/images.module.ts";
import { memoryImageStorage } from "../../platform/images/testing/memory-image-storage.ts";
import { PlatformModule } from "../../platform/platform.module.ts";
import { createIdentityRedis, IdentityModule } from "./identity.module.ts";

describe("IdentityModule", () => {
  it("s'arrête sans Redis connecté, comme à la génération du contrat OpenAPI", async () => {
    const prisma = createContextClient({
      context: "identity",
      env: { DATABASE_URL_IDENTITY: "postgresql://test@localhost/aucune-connexion" },
    });
    const moduleRef = await Test.createTestingModule({
      imports: [
        PlatformModule.register({
          schemaVersionCheck: async () => {},
          logSink: () => {},
          accessTokenVerifier: rejectingVerifier,
        }),
        IdentityModule.register({
          prisma,
          redis: createIdentityRedis(),
          lastLiveOf: async () => undefined,
          bannerUrlOf: async () => undefined,
          images: createImageBrick({
            storage: memoryImageStorage().storage,
            publicBaseUrl: "http://images.invalid",
          }),
          logSink: () => {},
        }),
      ],
    }).compile();
    await moduleRef.init();

    await expect(moduleRef.close()).resolves.toBeUndefined();
  });
});
