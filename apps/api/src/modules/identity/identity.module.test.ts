import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import { createContextClient } from "@repo/db";

import { createIdentityRedis, IdentityModule } from "./identity.module.ts";

describe("IdentityModule", () => {
  it("s'arrête sans Redis connecté, comme à la génération du contrat OpenAPI", async () => {
    const prisma = createContextClient({
      context: "identity",
      env: { DATABASE_URL_IDENTITY: "postgresql://test@localhost/aucune-connexion" },
    });
    const moduleRef = await Test.createTestingModule({
      imports: [IdentityModule.register({ prisma, redis: createIdentityRedis() })],
    }).compile();
    await moduleRef.init();

    await expect(moduleRef.close()).resolves.toBeUndefined();
  });
});
