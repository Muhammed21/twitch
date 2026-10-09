import { contexts } from "./contexts.ts";

export const expectedRoles: readonly string[] = [
  "migrator",
  ...contexts.map((context) => `app_${context}`),
  "app_outbox_relay",
  "app_health",
];

export const assertRolesProvisioned = async ({
  listRoles,
}: {
  listRoles: () => Promise<readonly string[]>;
}): Promise<void> => {
  const existing = new Set(await listRoles());
  const missing = expectedRoles.filter((role) => !existing.has(role));
  if (missing.length > 0) {
    throw new Error(
      `Rôles PostgreSQL manquants, à provisionner avant migration : ${missing.join(", ")}`,
    );
  }
};
