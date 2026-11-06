import { Test } from "@nestjs/testing";
import { exportJWK, generateKeyPair } from "jose";
import { describe, expect, it } from "vitest";

import { type ApiClient, createApiClient, importActingUserPrivateKey } from "@repo/api-client";
import { err, ok, type Result } from "@repo/result";

import { serviceCallersFor } from "../../../platform/admin-caller.ts";
import { rejectingVerifier } from "../../../platform/authentication.ts";
import { configureApp } from "../../../platform/configure-app.ts";
import { PlatformModule } from "../../../platform/platform.module.ts";
import type { CategoryView } from "../application/category-admin.ts";
import {
  AdminCategoriesController,
  CATEGORY_ADMIN,
  CATEGORY_IMAGE_URL,
  type CategoryAdmin,
} from "./admin-categories.controller.ts";

const HUMAN_ID = "8b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e";
const SERVICE_SECRET = "secret-du-compte-de-service-payload-admin";
const UPLOAD_ID = "9e8f7a6b-5c4d-4e3f-8a2b-1c0d9e8f7a6b";

const FROM_PAYLOAD = { actorId: HUMAN_ID, onBehalfOf: "svc:payload-admin", source: "payload" };

const JUST_CHATTING: CategoryView = {
  id: "7c6d5e4f-3a2b-4c1d-8e9f-0a1b2c3d4e5f",
  slug: "just-chatting",
  name: "Just Chatting",
  status: "active",
  imageKey: null,
  tags: ["IRL"],
};

const keys = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
const PUBLIC_JWK = JSON.stringify(await exportJWK(keys.publicKey));
const PRIVATE_JWK = JSON.stringify(await exportJWK(keys.privateKey));

type Answer = Result<CategoryView, "forbidden">;

type Calls = { readonly name: string; readonly request: unknown }[];

const recordingAdmin = (answer: Answer) => {
  const calls: Calls = [];
  const record =
    (name: string) =>
    async (request: unknown): Promise<typeof answer> => {
      calls.push({ name, request });
      return answer;
    };
  const admin: CategoryAdmin = {
    create: record("create"),
    merge: record("merge"),
    retire: record("retire"),
    image: record("image"),
    tags: record("tags"),
  };
  return { admin, calls };
};

const withApi = async (answer: Answer, run: (client: ApiClient, calls: Calls) => Promise<void>) => {
  const { admin, calls } = recordingAdmin(answer);
  const moduleRef = await Test.createTestingModule({
    imports: [
      PlatformModule.register({
        schemaVersionCheck: async () => {},
        logSink: () => {},
        accessTokenVerifier: rejectingVerifier,
        serviceCallers: await serviceCallersFor({
          serviceSecret: SERVICE_SECRET,
          actingUserPublicKey: PUBLIC_JWK,
        }),
      }),
    ],
    controllers: [AdminCategoriesController],
    providers: [
      { provide: CATEGORY_ADMIN, useValue: admin },
      { provide: CATEGORY_IMAGE_URL, useValue: (key: string) => `https://images.test/${key}` },
    ],
  }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.listen(0, "127.0.0.1");
  try {
    const client = createApiClient({
      baseUrl: await app.getUrl(),
      serviceSecret: SERVICE_SECRET,
      actingUserPrivateKey: await importActingUserPrivateKey(PRIVATE_JWK),
    });
    await run(client, calls);
  } finally {
    await app.close();
  }
};

const CATEGORY_RESPONSE = {
  id: JUST_CHATTING.id,
  slug: "just-chatting",
  name: "Just Chatting",
  status: "active",
  tags: ["IRL"],
};

describe("@repo/api-client contre les routes d'administration des catégories (ADR 0007)", () => {
  it.each<[string, (client: ApiClient) => Promise<unknown>, { name: string; request: unknown }]>([
    [
      "create",
      (client) =>
        client.admin.categories.create({
          actingUserId: HUMAN_ID,
          slug: "just-chatting",
          name: "Just Chatting",
        }),
      {
        name: "create",
        request: { actor: FROM_PAYLOAD, slug: "just-chatting", name: "Just Chatting" },
      },
    ],
    [
      "merge",
      (client) =>
        client.admin.categories.merge({
          actingUserId: HUMAN_ID,
          slug: "irl",
          targetSlug: "just-chatting",
        }),
      {
        name: "merge",
        request: { actor: FROM_PAYLOAD, sourceSlug: "irl", targetSlug: "just-chatting" },
      },
    ],
    [
      "retire",
      (client) => client.admin.categories.retire({ actingUserId: HUMAN_ID, slug: "irl" }),
      { name: "retire", request: { actor: FROM_PAYLOAD, slug: "irl" } },
    ],
    [
      "changeImage",
      (client) =>
        client.admin.categories.changeImage({
          actingUserId: HUMAN_ID,
          slug: "irl",
          uploadId: UPLOAD_ID,
        }),
      { name: "image", request: { actor: FROM_PAYLOAD, slug: "irl", uploadId: UPLOAD_ID } },
    ],
    [
      "changeTags",
      (client) =>
        client.admin.categories.changeTags({ actingUserId: HUMAN_ID, slug: "irl", tags: ["IRL"] }),
      { name: "tags", request: { actor: FROM_PAYLOAD, slug: "irl", tags: ["IRL"] } },
    ],
  ])("%s agit au nom de l'humain, pour le compte de service", async (_case, call, expected) => {
    await withApi(ok(JUST_CHATTING), async (client, calls) => {
      expect(await call(client)).toEqual({ ok: true, value: CATEGORY_RESPONSE });
      expect(calls).toEqual([expected]);
    });
  });

  it("rend le refus de l'humain sans le droit comme un échec 403", async () => {
    await withApi(err("forbidden"), async (client) => {
      expect(
        await client.admin.categories.retire({ actingUserId: HUMAN_ID, slug: "irl" }),
      ).toMatchObject({
        ok: false,
        error: { kind: "problem", problem: { status: 403, title: "Action non autorisée" } },
      });
    });
  });
});
