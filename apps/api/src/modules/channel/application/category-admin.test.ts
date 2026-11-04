import { describe, expect, it } from "vitest";

import { inMemoryAuthzContext, type RoleAssignment } from "@repo/authorization";
import { err, ok } from "@repo/result";

import {
  type CategoryCatalog,
  type CategoryCreation,
  type CategoryView,
  createCategory,
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
  ...overrides,
});

const VALORANT = makeCategory({
  id: "8d7e6f5a-4b3c-4d2e-9f0a-1b2c3d4e5f6a",
  slug: "valorant",
  name: "Valorant",
});

const memoryCatalog = ({
  categories = [makeCategory(), VALORANT],
}: {
  categories?: readonly CategoryView[];
} = {}) => {
  const created: CategoryCreation[] = [];
  const catalog: CategoryCatalog = {
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
      });
    },
  };
  return { catalog, created };
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
      value: { id: NEW_ID, slug: "league-of-legends", name: "League of Legends", status: "active" },
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
