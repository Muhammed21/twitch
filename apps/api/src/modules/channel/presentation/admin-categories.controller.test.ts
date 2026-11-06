import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import type { AccessTokenIdentity } from "@repo/auth-verifier";
import { err, ok } from "@repo/result";

import type { ServiceCallers } from "../../../platform/admin-caller.ts";
import type { AccessTokenVerifier } from "../../../platform/authentication.ts";
import { configureApp } from "../../../platform/configure-app.ts";
import { PlatformModule } from "../../../platform/platform.module.ts";
import { PAYLOAD_ADMIN_ACCOUNT } from "../../../platform/service-accounts.ts";
import type { CategoryView } from "../application/category-admin.ts";
import {
  AdminCategoriesController,
  CATEGORY_ADMIN,
  CATEGORY_IMAGE_URL,
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

const TOKEN_HOLDER = { actorId: ADMIN_ID, onBehalfOf: null, source: "api" };

const PAYLOAD_SECRET = "secret-du-compte-de-service-payload-admin";
const HUMAN_ID = "8b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e";

const PAYLOAD_CALLERS: ServiceCallers = {
  accounts: [{ ...PAYLOAD_ADMIN_ACCOUNT, secret: PAYLOAD_SECRET }],
  actingUser: {
    verify: async (header) =>
      header.startsWith("humain:") ? ok({ userId: header.slice(7) }) : err("invalid"),
  },
  now: () => new Date(),
};

const verifierWith = (scopes: readonly string[]): AccessTokenVerifier => ({
  verify: async () => ok(makeIdentity(scopes)),
});

const JUST_CHATTING: CategoryView = {
  id: "7c6d5e4f-3a2b-4c1d-8e9f-0a1b2c3d4e5f",
  slug: "just-chatting",
  name: "Just Chatting",
  status: "active",
  imageKey: null,
  tags: ["IRL"],
};

const JUST_CHATTING_RESPONSE = {
  id: JUST_CHATTING.id,
  slug: "just-chatting",
  name: "Just Chatting",
  status: "active",
  tags: ["IRL"],
};

const IMAGE_KEY = "images/category/3a4b5c6d-7e8f-4a0b-9c1d-2e3f4a5b6c7d.webp";
const UPLOAD_ID = "9e8f7a6b-5c4d-4e3f-8a2b-1c0d9e8f7a6b";

type Calls = { readonly name: string; readonly request: unknown }[];

type Answers = {
  readonly [Name in keyof CategoryAdmin]: Awaited<ReturnType<CategoryAdmin[Name]>>;
};

const ANSWERS: Answers = {
  create: ok(JUST_CHATTING),
  merge: ok(JUST_CHATTING),
  retire: ok(JUST_CHATTING),
  image: ok({ ...JUST_CHATTING, imageKey: IMAGE_KEY }),
  tags: ok({ ...JUST_CHATTING, tags: ["IRL", "Discussion"] }),
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
    image: async (request) => {
      calls.push({ name: "image", request });
      return answers.image;
    },
    tags: async (request) => {
      calls.push({ name: "tags", request });
      return answers.tags;
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
        serviceCallers: PAYLOAD_CALLERS,
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
    await run(`${await app.getUrl()}/v1/admin/categories`, calls);
  } finally {
    await app.close();
  }
};

const post = (
  url: string,
  {
    body,
    token = true,
    method = "POST",
  }: { body?: unknown; token?: boolean; method?: string } = {},
) =>
  fetch(url, {
    method,
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
      expect(await response.json()).toEqual(JUST_CHATTING_RESPONSE);
      expect(calls).toEqual([
        {
          name: "create",
          request: { actor: TOKEN_HOLDER, slug: "just-chatting", name: "Just Chatting" },
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
        detail:
          "Un slug s'écrit en minuscules, chiffres et tirets, sur 50 caractères au plus, et ne peut pas être catalog.",
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
      expect(await response.json()).toEqual(JUST_CHATTING_RESPONSE);
      expect(calls).toEqual([
        {
          name: "merge",
          request: { actor: TOKEN_HOLDER, sourceSlug: "irl", targetSlug: "just-chatting" },
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
      expect(await response.json()).toEqual({ ...JUST_CHATTING_RESPONSE, status: "retired" });
      expect(calls).toEqual([
        { name: "retire", request: { actor: TOKEN_HOLDER, slug: "just-chatting" } },
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

describe("PUT /v1/admin/categories/{slug}/image", () => {
  const put = (base: string, options: { body?: unknown; token?: boolean } = {}) =>
    post(`${base}/just-chatting/image`, {
      body: { uploadId: UPLOAD_ID },
      ...options,
      method: "PUT",
    });

  it("pose la pochette envoyée par l'identité du jeton, et rend son URL publique", async () => {
    await withAdmin({}, async (base, calls) => {
      const response = await put(base);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        ...JUST_CHATTING_RESPONSE,
        imageUrl: `https://images.test/${IMAGE_KEY}`,
      });
      expect(calls).toEqual([
        {
          name: "image",
          request: { actor: TOKEN_HOLDER, slug: "just-chatting", uploadId: UPLOAD_ID },
        },
      ]);
    });
  });

  it("répond 403 sans le scope admin:category.manage", async () => {
    await withAdmin({ scopes: ["openid"] }, async (base, calls) => {
      expect((await put(base)).status).toBe(403);
      expect(calls).toEqual([]);
    });
  });

  it.each([
    ["forbidden", 403, { title: "Action non autorisée" }],
    ["category_not_found", 404, { title: "Catégorie introuvable" }],
    ["category_inactive", 409, { title: "Catégorie déjà fusionnée ou retirée" }],
    [
      "too_small",
      422,
      {
        title: "Image trop petite",
        detail: "Une image de catégorie mesure au moins 285 × 380 pixels.",
      },
    ],
    ["upload_not_found", 422, { title: "Envoi introuvable" }],
    ["too_large", 422, { title: "Image trop lourde" }],
    ["unsupported_type", 422, { title: "Type d'image refusé" }],
    ["too_many_pixels", 422, { title: "Image trop grande" }],
  ] as const)("répond au refus %s par un %i", async (error, status, problem) => {
    await withAdmin({ answers: { image: err(error) } }, async (base) => {
      const response = await put(base);

      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({ status, ...problem });
    });
  });

  it.each([
    ["sans envoi", {}],
    ["avec un envoi qui n'est pas un UUID", { uploadId: "photo" }],
    ["avec un champ inconnu", { uploadId: UPLOAD_ID, imageKey: IMAGE_KEY }],
  ])("répond 400 pour un corps %s", async (_name, body) => {
    await withAdmin({}, async (base, calls) => {
      expect((await put(base, { body })).status).toBe(400);
      expect(calls).toEqual([]);
    });
  });
});

describe("PUT /v1/admin/categories/{slug}/tags (ADR 0050)", () => {
  const put = (base: string, options: { body?: unknown; token?: boolean } = {}) =>
    post(`${base}/just-chatting/tags`, {
      body: { tags: ["IRL", "Discussion"] },
      ...options,
      method: "PUT",
    });

  it("remplace les tags au nom de l'identité du jeton, et rend la catégorie", async () => {
    await withAdmin({}, async (base, calls) => {
      const response = await put(base);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        ...JUST_CHATTING_RESPONSE,
        tags: ["IRL", "Discussion"],
      });
      expect(calls).toEqual([
        {
          name: "tags",
          request: { actor: TOKEN_HOLDER, slug: "just-chatting", tags: ["IRL", "Discussion"] },
        },
      ]);
    });
  });

  it("répond 403 sans le scope admin:category.manage", async () => {
    await withAdmin({ scopes: ["openid"] }, async (base, calls) => {
      expect((await put(base)).status).toBe(403);
      expect(calls).toEqual([]);
    });
  });

  it.each([
    ["forbidden", 403, { title: "Action non autorisée" }],
    [
      "invalid_tags",
      400,
      {
        title: "Tags de catégorie invalides",
        detail:
          "Une catégorie porte 5 tags au plus, distincts, de 1 à 24 lettres, chiffres, espaces, tirets, apostrophes ou &.",
      },
    ],
    ["category_not_found", 404, { title: "Catégorie introuvable" }],
    ["category_inactive", 409, { title: "Catégorie déjà fusionnée ou retirée" }],
  ] as const)("répond au refus %s par un %i", async (error, status, problem) => {
    await withAdmin({ answers: { tags: err(error) } }, async (base) => {
      const response = await put(base);

      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({ status, ...problem });
    });
  });

  it.each([
    ["sans tags", {}],
    ["avec des tags qui ne sont pas une liste", { tags: "IRL" }],
    ["avec un tag qui n'est pas un texte", { tags: [1] }],
    ["avec un champ inconnu", { tags: [], name: "IRL" }],
  ])("répond 400 pour un corps %s", async (_name, body) => {
    await withAdmin({}, async (base, calls) => {
      expect((await put(base, { body })).status).toBe(400);
      expect(calls).toEqual([]);
    });
  });
});

describe("administration des catégories depuis Payload (ADR 0007)", () => {
  const fromPayload = (headers: Record<string, string>) => ({
    "content-type": "application/json",
    authorization: `Service ${PAYLOAD_SECRET}`,
    ...headers,
  });

  it("agit au nom de l'humain de X-Acting-User, jamais du compte de service", async () => {
    await withAdmin({}, async (base, calls) => {
      const response = await fetch(base, {
        method: "POST",
        headers: fromPayload({ "x-acting-user": `humain:${HUMAN_ID}` }),
        body: JSON.stringify({ slug: "just-chatting", name: "Just Chatting" }),
      });

      expect(response.status).toBe(201);
      expect(calls).toEqual([
        {
          name: "create",
          request: {
            actor: { actorId: HUMAN_ID, onBehalfOf: "svc:payload-admin", source: "payload" },
            slug: "just-chatting",
            name: "Just Chatting",
          },
        },
      ]);
    });
  });

  it("répond 403 sans X-Acting-User, sans rien créer", async () => {
    await withAdmin({}, async (base, calls) => {
      const response = await fetch(base, {
        method: "POST",
        headers: fromPayload({}),
        body: JSON.stringify({ slug: "just-chatting", name: "Just Chatting" }),
      });

      expect(response.status).toBe(403);
      expect(calls).toEqual([]);
    });
  });

  it("répond 403 quand l'humain n'a pas le droit, même si le compte de service a le scope", async () => {
    await withAdmin({ answers: { retire: err("forbidden") } }, async (base) => {
      const response = await fetch(`${base}/irl/retire`, {
        method: "POST",
        headers: fromPayload({ "x-acting-user": `humain:${HUMAN_ID}` }),
      });

      expect(response.status).toBe(403);
    });
  });
});
