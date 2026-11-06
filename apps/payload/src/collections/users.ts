import type { CollectionConfig } from "payload";

const ACCOUNT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const isUnset = (value: unknown) => value === undefined || value === null || value === "";

export const actingUserIdProblem = (value: unknown): string | undefined =>
  isUnset(value) || (typeof value === "string" && ACCOUNT_ID.test(value))
    ? undefined
    : "Un identifiant de compte API est un UUID en minuscules.";

export const neverAfterCreation = () => false;

export const Users: CollectionConfig = {
  slug: "users",
  admin: { useAsTitle: "email" },
  auth: true,
  fields: [
    {
      name: "actingUserId",
      type: "text",
      label: "Identifiant du compte API",
      unique: true,
      index: true,
      access: { update: neverAfterCreation },
      admin: {
        description:
          "Compte de l'API au nom duquel cet administrateur agit (X-Acting-User). Posé à la création, il ne se modifie plus.",
      },
      validate: (value: unknown) => actingUserIdProblem(value) ?? true,
    },
  ],
};
