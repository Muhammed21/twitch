import { describe, expect, it } from "vitest";

import { inMemoryAuthzContext, type RoleAssignment } from "@repo/authorization";
import { err, ok } from "@repo/result";

import type { FinalizeImage } from "../../../platform/images/images.module.ts";
import {
  type CategoryCatalog,
  type CategoryCreation,
  type CategoryImageChange,
  type CategoryMerge,
  type CategoryRetirement,
  type CategoryView,
  changeCategoryImage,
  createCategory,
  mergeCategory,
  retireCategory,
} from "./category-admin.ts";

const NOW = new Date("2026-11-04T12:00:00.000Z");
const ADMIN = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const STAFF = "5a3b0d2f-8c4e-4f9b-a021-3d6e7f8a9b0c";
const VIEWER = "6b4c1e3a-9d5f-4a0c-b132-4e7f8a9b0c1d";
const NEW_ID = "1e2d3c4b-5a69-4b8a-9f10-7f6e5d4c3b2a";
const EVENT_ID = "2f3e4d5c-6b7a-4c9b-8a01-8a7f6e5d4c3b";

const onPlatform = (role: "admin" | "staff"): RoleAssignment => ({
  role,
  scope: { type: "platform" },
  expiresAt: null,
  revokedAt: null,
});

const makeCategory = (overrides: Partial<CategoryView> = {}): CategoryView => ({
  id: "7c6d5e4f-3a2b-4c1d-8e9f-0a1b2c3d4e5f",
  slug: "just-chatting",
  name: "Just Chatting",
  status: "active",
  imageKey: null,
  ...overrides,
});

const VALORANT = makeCategory({
  id: "8d7e6f5a-4b3c-4d2e-9f0a-1b2c3d4e5f6a",
  slug: "valorant",
  name: "Valorant",
});

const memoryCatalog = ({
  categories = [makeCategory(), VALORANT],
  channelsIn = {},
}: {
  categories?: readonly CategoryView[];
  channelsIn?: Readonly<Record<string, number>>;
} = {}) => {
  const created: CategoryCreation[] = [];
  const merges: CategoryMerge[] = [];
  const retirements: CategoryRetirement[] = [];
  const imageChanges: CategoryImageChange[] = [];
  const byId = (id: string) => categories.find((category) => category.id === id);
  const catalog: CategoryCatalog = {
    findBySlug: async (slug) => categories.find((category) => category.slug === slug) ?? null,
    create: async (creation) => {
      if (categories.some(({ slug }) => slug === creation.slug)) {
        return err("slug_taken");
      }
      created.push(creation);
      return ok({
        id: creation.categoryId,
        slug: creation.slug,
        name: creation.name,
        status: "active",
        imageKey: null,
      });
    },
    merge: async (merge) => {
      const source = byId(merge.sourceId);
      const target = byId(merge.targetId);
      if (source?.status !== "active" || target?.status !== "active") {
        return err("invalid_merge");
      }
      merges.push(merge);
      return ok(target);
    },
    retire: async (retirement) => {
      const category = byId(retirement.categoryId);
      if (category?.status !== "active") {
        return err("category_inactive");
      }
      if ((channelsIn[category.id] ?? 0) > 0) {
        return err("category_in_use");
      }
      retirements.push(retirement);
      return ok({ ...category, status: "retired" });
    },
    changeImage: async (change) => {
      const category = byId(change.categoryId);
      if (category?.status !== "active") {
        return err("category_inactive");
      }
      imageChanges.push(change);
      return ok({ ...category, imageKey: change.imageKey });
    },
  };
  return { catalog, created, merges, retirements, imageChanges };
};

const ASSIGNMENTS = { [ADMIN]: [onPlatform("admin")], [STAFF]: [onPlatform("staff")] };

const dependencies = (catalog: CategoryCatalog) => ({
  catalog,
  authz: inMemoryAuthzContext({ assignments: ASSIGNMENTS, now: () => NOW }),
  newId: (() => {
    const ids = [NEW_ID, EVENT_ID];
    return () => ids.shift() ?? "";
  })(),
  now: () => NOW,
});

describe("création d'une catégorie", () => {
  it("crée la catégorie active pour un admin, avec l'event channel.category.created", async () => {
    const { catalog, created } = memoryCatalog();

    const outcome = await createCategory(dependencies(catalog))({
      actorId: ADMIN,
      slug: "league-of-legends",
      name: " League of Legends ",
    });

    expect(outcome).toEqual({
      ok: true,
      value: {
        id: NEW_ID,
        slug: "league-of-legends",
        name: "League of Legends",
        status: "active",
        imageKey: null,
      },
    });
    expect(created).toEqual([
      {
        categoryId: NEW_ID,
        slug: "league-of-legends",
        name: "League of Legends",
        outboxEventId: EVENT_ID,
        occurredAt: NOW,
      },
    ]);
  });

  it.each([
    ["staff", STAFF],
    ["un compte sans rôle", VIEWER],
  ])("est refusée à %s, sans rien écrire", async (_name, actorId) => {
    const { catalog, created } = memoryCatalog();

    const outcome = await createCategory(dependencies(catalog))({
      actorId,
      slug: "league-of-legends",
      name: "League of Legends",
    });

    expect(outcome).toEqual({ ok: false, error: "forbidden" });
    expect(created).toEqual([]);
  });

  it.each([
    ["invalid_slug", { slug: "League of Legends", name: "League of Legends" }],
    ["invalid_name", { slug: "league-of-legends", name: "  " }],
  ] as const)("répond %s pour une catégorie mal formée", async (error, request) => {
    const { catalog, created } = memoryCatalog();

    const outcome = await createCategory(dependencies(catalog))({ actorId: ADMIN, ...request });

    expect(outcome).toEqual({ ok: false, error });
    expect(created).toEqual([]);
  });

  it("refuse un slug déjà pris", async () => {
    const { catalog } = memoryCatalog();

    const outcome = await createCategory(dependencies(catalog))({
      actorId: ADMIN,
      slug: "valorant",
      name: "Valorant 2",
    });

    expect(outcome).toEqual({ ok: false, error: "slug_taken" });
  });

  it("ne révèle pas la règle du slug à un compte sans droit", async () => {
    const { catalog } = memoryCatalog();

    const outcome = await createCategory(dependencies(catalog))({
      actorId: VIEWER,
      slug: "Mal Formé",
      name: "",
    });

    expect(outcome).toEqual({ ok: false, error: "forbidden" });
  });
});

describe("fusion d'une catégorie dans une autre", () => {
  it("fusionne la source dans la cible pour un admin, et rend la cible", async () => {
    const { catalog, merges } = memoryCatalog();

    const outcome = await mergeCategory(dependencies(catalog))({
      actorId: ADMIN,
      sourceSlug: "just-chatting",
      targetSlug: "valorant",
    });

    expect(outcome).toEqual({ ok: true, value: VALORANT });
    expect(merges).toEqual([
      {
        sourceId: makeCategory().id,
        targetId: VALORANT.id,
        outboxEventId: NEW_ID,
        occurredAt: NOW,
      },
    ]);
  });

  it("est refusée à un compte sans le rôle admin", async () => {
    const { catalog, merges } = memoryCatalog();

    const outcome = await mergeCategory(dependencies(catalog))({
      actorId: STAFF,
      sourceSlug: "just-chatting",
      targetSlug: "valorant",
    });

    expect(outcome).toEqual({ ok: false, error: "forbidden" });
    expect(merges).toEqual([]);
  });

  it.each([
    ["une source inconnue", { sourceSlug: "inconnue", targetSlug: "valorant" }],
    ["une cible inconnue", { sourceSlug: "just-chatting", targetSlug: "inconnue" }],
  ])("dit que la catégorie n'existe pas pour %s", async (_name, request) => {
    const { catalog, merges } = memoryCatalog();

    const outcome = await mergeCategory(dependencies(catalog))({ actorId: ADMIN, ...request });

    expect(outcome).toEqual({ ok: false, error: "category_not_found" });
    expect(merges).toEqual([]);
  });

  it("refuse la fusion d'une catégorie dans elle-même", async () => {
    const { catalog, merges } = memoryCatalog();

    const outcome = await mergeCategory(dependencies(catalog))({
      actorId: ADMIN,
      sourceSlug: "valorant",
      targetSlug: "valorant",
    });

    expect(outcome).toEqual({ ok: false, error: "invalid_merge" });
    expect(merges).toEqual([]);
  });

  it.each([
    ["depuis une catégorie fusionnée", "merged", "active"],
    ["vers une catégorie retirée", "active", "retired"],
  ] as const)("refuse la fusion %s", async (_name, sourceStatus, targetStatus) => {
    const { catalog, merges } = memoryCatalog({
      categories: [makeCategory({ status: sourceStatus }), { ...VALORANT, status: targetStatus }],
    });

    const outcome = await mergeCategory(dependencies(catalog))({
      actorId: ADMIN,
      sourceSlug: "just-chatting",
      targetSlug: "valorant",
    });

    expect(outcome).toEqual({ ok: false, error: "invalid_merge" });
    expect(merges).toEqual([]);
  });
});

describe("retrait d'une catégorie", () => {
  it("retire une catégorie inutilisée pour un admin", async () => {
    const { catalog, retirements } = memoryCatalog();

    const outcome = await retireCategory(dependencies(catalog))({
      actorId: ADMIN,
      slug: "valorant",
    });

    expect(outcome).toEqual({ ok: true, value: { ...VALORANT, status: "retired" } });
    expect(retirements).toEqual([
      { categoryId: VALORANT.id, outboxEventId: NEW_ID, occurredAt: NOW },
    ]);
  });

  it("refuse le retrait d'une catégorie qu'une chaîne utilise encore", async () => {
    const { catalog, retirements } = memoryCatalog({ channelsIn: { [VALORANT.id]: 1 } });

    const outcome = await retireCategory(dependencies(catalog))({
      actorId: ADMIN,
      slug: "valorant",
    });

    expect(outcome).toEqual({ ok: false, error: "category_in_use" });
    expect(retirements).toEqual([]);
  });

  it("refuse le retrait d'une catégorie déjà fusionnée", async () => {
    const { catalog } = memoryCatalog({ categories: [{ ...VALORANT, status: "merged" }] });

    const outcome = await retireCategory(dependencies(catalog))({
      actorId: ADMIN,
      slug: "valorant",
    });

    expect(outcome).toEqual({ ok: false, error: "category_inactive" });
  });

  it("dit qu'une catégorie inconnue n'existe pas", async () => {
    const { catalog } = memoryCatalog();

    const outcome = await retireCategory(dependencies(catalog))({
      actorId: ADMIN,
      slug: "inconnue",
    });

    expect(outcome).toEqual({ ok: false, error: "category_not_found" });
  });

  it("est refusé à un compte sans le rôle admin", async () => {
    const { catalog, retirements } = memoryCatalog();

    const outcome = await retireCategory(dependencies(catalog))({
      actorId: VIEWER,
      slug: "valorant",
    });

    expect(outcome).toEqual({ ok: false, error: "forbidden" });
    expect(retirements).toEqual([]);
  });
});

const UPLOAD_ID = "9e8f7a6b-5c4d-4e3f-8a2b-1c0d9e8f7a6b";
const IMAGE_KEY = "images/category/3a4b5c6d-7e8f-4a0b-9c1d-2e3f4a5b6c7d.webp";

const recordingFinalizer = (outcome: Awaited<ReturnType<FinalizeImage>>) => {
  const requests: Parameters<FinalizeImage>[0][] = [];
  const finalizeImage: FinalizeImage = async (request) => {
    requests.push(request);
    return outcome;
  };
  return { finalizeImage, requests };
};

const FINALIZED = ok({ key: IMAGE_KEY, url: `https://images.twitch.local/${IMAGE_KEY}` });

describe("pochette d'une catégorie", () => {
  it("relit l'envoi de l'admin pour une catégorie, puis pose la clé avec channel.category.updated", async () => {
    const { catalog, imageChanges } = memoryCatalog();
    const { finalizeImage, requests } = recordingFinalizer(FINALIZED);

    const outcome = await changeCategoryImage({ ...dependencies(catalog), finalizeImage })({
      actorId: ADMIN,
      slug: "just-chatting",
      uploadId: UPLOAD_ID,
    });

    expect(outcome).toEqual(ok(makeCategory({ imageKey: IMAGE_KEY })));
    expect(requests).toEqual([{ uploadId: UPLOAD_ID, purpose: "category", userId: ADMIN }]);
    expect(imageChanges).toEqual([
      {
        categoryId: makeCategory().id,
        imageKey: IMAGE_KEY,
        outboxEventId: NEW_ID,
        occurredAt: NOW,
      },
    ]);
  });

  it.each([
    ["un compte sans le rôle admin", STAFF, "just-chatting", "forbidden"],
    ["une catégorie inconnue", ADMIN, "inconnue", "category_not_found"],
    ["une catégorie fusionnée", ADMIN, "talk", "category_inactive"],
  ] as const)("est refusée pour %s, sans relire l'envoi", async (_name, actorId, slug, error) => {
    const { catalog, imageChanges } = memoryCatalog({
      categories: [
        makeCategory(),
        makeCategory({ id: VALORANT.id, slug: "talk", status: "merged" }),
      ],
    });
    const { finalizeImage, requests } = recordingFinalizer(FINALIZED);

    const outcome = await changeCategoryImage({ ...dependencies(catalog), finalizeImage })({
      actorId,
      slug,
      uploadId: UPLOAD_ID,
    });

    expect(outcome).toEqual(err(error));
    expect(requests).toEqual([]);
    expect(imageChanges).toEqual([]);
  });

  it("rend le refus de l'image sans toucher à la catégorie", async () => {
    const { catalog, imageChanges } = memoryCatalog();
    const { finalizeImage } = recordingFinalizer(err("too_small"));

    const outcome = await changeCategoryImage({ ...dependencies(catalog), finalizeImage })({
      actorId: ADMIN,
      slug: "just-chatting",
      uploadId: UPLOAD_ID,
    });

    expect(outcome).toEqual(err("too_small"));
    expect(imageChanges).toEqual([]);
  });
});
