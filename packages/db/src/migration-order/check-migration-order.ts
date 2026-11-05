export type Migration = {
  readonly name: string;
  readonly checksum: string;
};

const timestampOf = (migration: Migration): string => migration.name.slice(0, 14);

const sharedTimestamps = (migrations: readonly Migration[]): readonly string[] =>
  [...new Set(migrations.map(timestampOf))]
    .map((timestamp) => ({
      timestamp,
      names: migrations
        .filter((migration) => timestampOf(migration) === timestamp)
        .map(({ name }) => name),
    }))
    .filter(({ names }) => names.length > 1)
    .map(({ timestamp, names }) => `Horodatage ${timestamp} partagé par ${names.join(", ")}`);

const migrationsBeforeBase = ({
  current,
  base,
}: {
  readonly current: readonly Migration[];
  readonly base: readonly Migration[];
}): readonly string[] => {
  const latestBase = base
    .map(({ name }) => name)
    .toSorted()
    .at(-1);
  if (latestBase === undefined) {
    return [];
  }
  const baseChecksums = new Set(base.map(({ checksum }) => checksum));
  return current
    .filter(({ checksum }) => !baseChecksums.has(checksum))
    .filter((migration) => timestampOf(migration) <= latestBase.slice(0, 14))
    .map(
      ({ name }) =>
        `${name} doit être postérieure à ${latestBase}, la dernière migration de la branche de base`,
    );
};

export const checkMigrationOrder = ({
  current,
  base,
}: {
  readonly current: readonly Migration[];
  readonly base: readonly Migration[];
}): readonly string[] => [...sharedTimestamps(current), ...migrationsBeforeBase({ current, base })];
