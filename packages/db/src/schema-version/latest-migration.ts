const MIGRATION_DIRECTORY = /^\d{14}_\w+$/;

export const latestMigration = (entries: readonly string[]): string => {
  const latest = entries
    .filter((entry) => MIGRATION_DIRECTORY.test(entry))
    .toSorted()
    .at(-1);
  if (latest === undefined) {
    throw new Error("Aucune migration dans le dossier des migrations");
  }
  return latest;
};
