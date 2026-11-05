import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import type { AccessTokenIdentity } from "@repo/auth-verifier";
import { err, ok } from "@repo/result";

import { type AccessTokenVerifier, rejectingVerifier } from "../../../platform/authentication.ts";
import { configureApp } from "../../../platform/configure-app.ts";
import { PlatformModule } from "../../../platform/platform.module.ts";
import type {
  CategoryFollowRequest,
  ChangeCategoryFollow,
} from "../application/category-follow.ts";
import {
  FOLLOW_CATEGORY,
  FollowedCategoriesController,
  UNFOLLOW_CATEGORY,
} from "./followed-categories.controller.ts";

const VIEWER_ID = "6b4c1e3a-9d5f-4a0c-b132-4e7f8a9b0c1d";

const IDENTITY: AccessTokenIdentity = {
  userId: VIEWER_ID,
  sid: "sid-1",
  scopes: [],
  authTime: null,
  amr: [],
  revocation: "checked",
};

const acceptingVerifier: AccessTokenVerifier = { verify: async () => ok(IDENTITY) };

const AUTHENTICATED = { authorization: "Bearer jeton" };

type Calls = { follows: CategoryFollowRequest[]; unfollows: CategoryFollowRequest[] };

const withFollowedCategories = async (
  {
    verifier = acceptingVerifier,
    outcome = ok(undefined),
  }: {
    verifier?: AccessTokenVerifier;
    outcome?: Awaited<ReturnType<ChangeCategoryFollow>>;
  },
  run: (base: string, calls: Calls) => Promise<void>,
) => {
  const calls: Calls = { follows: [], unfollows: [] };
  const recording =
    (into: CategoryFollowRequest[]): ChangeCategoryFollow =>
    async (request) => {
      into.push(request);
      return outcome;
    };
  const moduleRef = await Test.createTestingModule({
    imports: [
      PlatformModule.register({
        schemaVersionCheck: async () => {},
        logSink: () => {},
        accessTokenVerifier: verifier,
      }),
    ],
    controllers: [FollowedCategoriesController],
    providers: [
      { provide: FOLLOW_CATEGORY, useValue: recording(calls.follows) },
      { provide: UNFOLLOW_CATEGORY, useValue: recording(calls.unfollows) },
    ],
  }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.listen(0, "127.0.0.1");
  try {
    await run(`${await app.getUrl()}/v1/me/followed-categories`, calls);
  } finally {
    await app.close();
  }
};

describe.each([
  ["PUT", "follows"],
  ["DELETE", "unfollows"],
] as const)("%s /v1/me/followed-categories/{slug} (ADR 0049 §7)", (method, recorded) => {
  it("répond 204 et agit pour le compte du jeton sur le slug de l'URL", async () => {
    await withFollowedCategories({}, async (base, calls) => {
      const response = await fetch(`${base}/just-chatting`, { method, headers: AUTHENTICATED });

      expect(response.status).toBe(204);
      expect(await response.text()).toBe("");
      expect(calls[recorded]).toEqual([{ userId: VIEWER_ID, slug: "just-chatting" }]);
    });
  });

  it("répond 404 quand le slug ne mène à aucune catégorie suivable", async () => {
    await withFollowedCategories({ outcome: err("category_not_found") }, async (base) => {
      const response = await fetch(`${base}/retiree`, { method, headers: AUTHENTICATED });

      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ title: "Catégorie introuvable" });
    });
  });

  it("répond 401 sans jeton, sans rien changer", async () => {
    await withFollowedCategories({ verifier: rejectingVerifier }, async (base, calls) => {
      const response = await fetch(`${base}/just-chatting`, { method });

      expect(response.status).toBe(401);
      expect(calls[recorded]).toEqual([]);
    });
  });
});
