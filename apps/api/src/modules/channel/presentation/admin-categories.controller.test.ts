import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import type { AccessTokenIdentity } from "@repo/auth-verifier";
import { err, ok } from "@repo/result";

import type { AccessTokenVerifier } from "../../../platform/authentication.ts";
import { configureApp } from "../../../platform/configure-app.ts";
import { PlatformModule } from "../../../platform/platform.module.ts";
import type { CategoryView } from "../application/category-admin.ts";
import {
  AdminCategoriesController,
  CATEGORY_ADMIN,
  type CategoryAdmin,
} from "./admin-categories.controller.ts";

const ADMIN_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const MANAGE_SCOPE = "admin:category.manage";

const makeIdentity = (scopes: readonly string[]): AccessTokenIdentity => ({
  userId: ADMIN_ID,
  sid: "sid-1",
  scopes,
  authTime: null,
  amr: [],
  revocation: "checked",
});

const verifierWith = (scopes: readonly string[]): AccessTokenVerifier => ({
  verify: async () => ok(makeIdentity(scopes)),
});

const JUST_CHATTING: CategoryView = {
  id: "7c6d5e4f-3a2b-4c1d-8e9f-0a1b2c3d4e5f",
  slug: "just-chatting",
  name: "Just Chatting",
  status: "active",
};

type Calls = { readonly name: string; readonly request: unknown }[];

type Answers = {
  readonly [Name in keyof CategoryAdmin]: Awaited<ReturnType<CategoryAdmin[Name]>>;
};

const ANSWERS: Answers = {
  create: ok(JUST_CHATTING),
  merge: ok(JUST_CHATTING),
  retire: ok(JUST_CHATTING),
};

const recordingAdmin = (answers: Answers) => {
  const calls: Calls = [];
  const admin: CategoryAdmin = {
    create: async (request) => {
      calls.push({ name: "create", request });
      return answers.create;
    },
    merge: async (request) => {
      calls.push({ name: "merge", request });
      return answers.merge;
    },
    retire: async (request) => {
      calls.push({ name: "retire", request });
      return answers.retire;
    },
  };
  return { admin, calls };
};

const withAdmin = async (
  {
    answers = {},
    scopes = [MANAGE_SCOPE],
  }: { answers?: Partial<Answers>; scopes?: readonly string[] },
  run: (base: string, calls: Calls) => Promise<void>,
) => {
  const { admin, calls } = recordingAdmin({ ...ANSWERS, ...answers });
  const moduleRef = await Test.createTestingModule({
    imports: [
      PlatformModule.register({
        schemaVersionCheck: async () => {},
        logSink: () => {},
        accessTokenVerifier: verifierWith(scopes),
      }),
    ],
    controllers: [AdminCategoriesController],
    providers: [{ provide: CATEGORY_ADMIN, useValue: admin }],
  }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.listen(0, "127.0.0.1");
  try {
    await run(`${await app.getUrl()}/v1/admin/categories`, calls);
  } finally {
    await app.close();
  }
};

const post = (url: string, { body, token = true }: { body?: unknown; token?: boolean } = {}) =>
  fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: "Bearer jeton" } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

describe("POST /v1/admin/categories", () => {
  it("crée la catégorie au nom de l'identité du jeton", async () => {
    await withAdmin({}, async (base, calls) => {
      const response = await post(base, {
        body: { slug: "just-chatting", name: "Just Chatting" },
      });

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual(JUST_CHATTING);
      expect(calls).toEqual([
        {
          name: "create",
          request: { actorId: ADMIN_ID, slug: "just-chatting", name: "Just Chatting" },
        },
      ]);
    });
  });

  it.each([
    ["sans jeton", { scopes: [MANAGE_SCOPE] }, false, 401],
    ["sans le scope admin:category.manage", { scopes: ["openid", "admin:user.ban"] }, true, 403],
  ] as const)("répond %s, sans rien créer", async (_name, options, token, status) => {
    await withAdmin(options, async (base, calls) => {
      const response = await post(base, {
        body: { slug: "just-chatting", name: "Just Chatting" },
        token,
      });

      expect(response.status).toBe(status);
      expect(calls).toEqual([]);
    });
  });

  it.each([
    ["forbidden", 403, { title: "Action non autorisée" }],
    [
      "invalid_slug",
      422,
      {
        title: "Slug de catégorie invalide",
        detail: "Un slug s'écrit en minuscules, chiffres et tirets, sur 50 caractères au plus.",
      },
    ],
    [
      "invalid_name",
      422,
      { title: "Nom de catégorie invalide", detail: "Un nom compte de 1 à 50 caractères." },
    ],
    ["slug_taken", 409, { title: "Slug de catégorie déjà pris" }],
  ] as const)("répond au refus %s par un %i", async (error, status, problem) => {
    await withAdmin({ answers: { create: err(error) } }, async (base) => {
      const response = await post(base, { body: { slug: "x", name: "X" } });

      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({ status, ...problem });
    });
  });

  it.each([
    ["sans slug", { name: "Just Chatting" }],
    ["sans nom", { slug: "just-chatting" }],
    ["avec un champ inconnu", { slug: "just-chatting", name: "Just Chatting", imageKey: "k" }],
  ])("répond 400 pour un corps %s", async (_name, body) => {
    await withAdmin({}, async (base, calls) => {
      const response = await post(base, { body });

      expect(response.status).toBe(400);
      expect(calls).toEqual([]);
    });
  });
});

describe("POST /v1/admin/categories/{slug}/merge", () => {
  it("fusionne la catégorie du chemin dans la cible et rend la cible", async () => {
    await withAdmin({}, async (base, calls) => {
      const response = await post(`${base}/irl/merge`, { body: { targetSlug: "just-chatting" } });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(JUST_CHATTING);
      expect(calls).toEqual([
        {
          name: "merge",
          request: { actorId: ADMIN_ID, sourceSlug: "irl", targetSlug: "just-chatting" },
        },
      ]);
    });
  });

  it("répond 403 sans le scope admin:category.manage", async () => {
    await withAdmin({ scopes: [] }, async (base, calls) => {
      const response = await post(`${base}/irl/merge`, { body: { targetSlug: "just-chatting" } });

      expect(response.status).toBe(403);
      expect(calls).toEqual([]);
    });
  });

  it.each([
    ["forbidden", 403, { title: "Action non autorisée" }],
    ["category_not_found", 404, { title: "Catégorie introuvable" }],
    [
      "invalid_merge",
      409,
      {
        title: "Fusion impossible",
        detail: "La source et la cible sont deux catégories distinctes et actives.",
      },
    ],
  ] as const)("répond au refus %s par un %i", async (error, status, problem) => {
    await withAdmin({ answers: { merge: err(error) } }, async (base) => {
      const response = await post(`${base}/irl/merge`, { body: { targetSlug: "just-chatting" } });

      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({ status, ...problem });
    });
  });

  it("répond 400 sans cible", async () => {
    await withAdmin({}, async (base, calls) => {
      const response = await post(`${base}/irl/merge`, { body: {} });

      expect(response.status).toBe(400);
      expect(calls).toEqual([]);
    });
  });
});

describe("POST /v1/admin/categories/{slug}/retire", () => {
  it("retire la catégorie du chemin", async () => {
    const retired: CategoryView = { ...JUST_CHATTING, status: "retired" };
    await withAdmin({ answers: { retire: ok(retired) } }, async (base, calls) => {
      const response = await post(`${base}/just-chatting/retire`);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(retired);
      expect(calls).toEqual([
        { name: "retire", request: { actorId: ADMIN_ID, slug: "just-chatting" } },
      ]);
    });
  });

  it("répond 403 sans le scope admin:category.manage", async () => {
    await withAdmin({ scopes: ["openid"] }, async (base, calls) => {
      const response = await post(`${base}/just-chatting/retire`);

      expect(response.status).toBe(403);
      expect(calls).toEqual([]);
    });
  });

  it.each([
    ["forbidden", 403, { title: "Action non autorisée" }],
    ["category_not_found", 404, { title: "Catégorie introuvable" }],
    ["category_inactive", 409, { title: "Catégorie déjà fusionnée ou retirée" }],
    [
      "category_in_use",
      409,
      {
        title: "Catégorie encore utilisée",
        detail: "Une chaîne utilise cette catégorie : fusionne-la dans une autre.",
      },
    ],
  ] as const)("répond au refus %s par un %i", async (error, status, problem) => {
    await withAdmin({ answers: { retire: err(error) } }, async (base) => {
      const response = await post(`${base}/just-chatting/retire`);

      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({ status, ...problem });
    });
  });
});
