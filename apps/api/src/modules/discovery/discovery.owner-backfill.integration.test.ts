import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { createContextClient } from "@repo/db";

const discovery = createContextClient({ context: "discovery", env: process.env });
const channelDb = createContextClient({ context: "channel", env: process.env });

const BACKFILL = readFileSync(
  new URL(
    "../../../../../packages/db/prisma/migrations/20261108100100_discovery_live_channel_owner_backfill/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

const migratorUrl = (): string => {
  const url = process.env.DATABASE_URL_MIGRATOR;
  if (url === undefined) {
    throw new Error("DATABASE_URL_MIGRATOR manquante : copier .env.example en .env");
  }
  return url;
};

const runBackfill = async () => {
  const client = new Client({ connectionString: migratorUrl() });
  await client.connect();
  try {
    await client.query(BACKFILL);
  } finally {
    await client.end();
  }
};

const seededChannels: string[] = [];
const seededEvents: string[] = [];

afterAll(async () => {
  await discovery.discoveryLiveChannelView.deleteMany({
    where: { channelId: { in: seededChannels } },
  });
  await channelDb.channelOutbox.deleteMany({ where: { id: { in: seededEvents } } });
  await Promise.all([discovery.$disconnect(), channelDb.$disconnect()]);
});

const seedView = async ({ ownerId }: { ownerId: string | null }): Promise<string> => {
  const channelId = randomUUID();
  await discovery.discoveryLiveChannelView.create({
    data: { channelId, slug: `owner_${channelId.slice(0, 8)}`, ownerId },
  });
  seededChannels.push(channelId);
  return channelId;
};

const seedChannelCreated = async ({
  channelId,
  ownerId,
}: {
  channelId: string;
  ownerId: string;
}) => {
  const id = randomUUID();
  await channelDb.channelOutbox.create({
    data: {
      id,
      name: "channel.created",
      version: 1,
      payload: { channelId, ownerId, slug: `owner_${channelId.slice(0, 8)}` },
      occurredAt: new Date(),
      publishedAt: new Date(),
    },
  });
  seededEvents.push(id);
};

const ownerOf = async (channelId: string) =>
  (await discovery.discoveryLiveChannelView.findUnique({ where: { channelId } }))?.ownerId;

describe("rattrapage du propriétaire des chaînes déjà projetées", () => {
  it("copie le propriétaire du channel.created de la chaîne", async () => {
    const ownerId = randomUUID();
    const channelId = await seedView({ ownerId: null });
    await seedChannelCreated({ channelId, ownerId });

    await runBackfill();

    expect(await ownerOf(channelId)).toBe(ownerId);
  });

  it("laisse sans propriétaire une chaîne dont aucun channel.created n'est connu", async () => {
    const channelId = await seedView({ ownerId: null });

    await runBackfill();

    expect(await ownerOf(channelId)).toBeNull();
  });

  it("ne change pas le propriétaire déjà projeté d'une chaîne", async () => {
    const projected = randomUUID();
    const channelId = await seedView({ ownerId: projected });
    await seedChannelCreated({ channelId, ownerId: randomUUID() });

    await runBackfill();

    expect(await ownerOf(channelId)).toBe(projected);
  });
});
