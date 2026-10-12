import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { createContextClient } from "@repo/db";

import { prismaSessionRevocationStore } from "./infrastructure/prisma-session-revocation-store.ts";

const urlOf = (variable: string): string => {
  const url = process.env[variable];
  if (url === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return url;
};

const asMigrator = async <T>(run: (client: Client) => Promise<T>): Promise<T> => {
  const client = new Client({ connectionString: urlOf("DATABASE_URL_MIGRATOR") });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
};

const seedUserWithSessions = (count: number) =>
  asMigrator(async (client) => {
    const userId = randomUUID();
    await client.query(
      `INSERT INTO "identity"."IdentityUser" ("id", "name", "email", "updatedAt")
       VALUES ($1, 'Viewer de test', $2, now())`,
      [userId, `revocation-${userId}@twitch.local`],
    );
    const sids = Array.from({ length: count }, () => randomUUID()).toSorted();
    await Promise.all(
      sids.map((sid) =>
        client.query(
          `INSERT INTO "identity"."IdentitySession" ("id", "expiresAt", "token", "updatedAt", "userId")
           VALUES ($1, now() + interval '1 day', $2, now(), $3)`,
          [sid, randomUUID(), userId],
        ),
      ),
    );
    return { userId, sids };
  });

const remainingSessionsOf = (userId: string) =>
  asMigrator(async (client) => {
    const { rows } = await client.query(
      `SELECT "id" FROM "identity"."IdentitySession" WHERE "userId" = $1`,
      [userId],
    );
    return rows;
  });

describe("prismaSessionRevocationStore, contre la base locale migrée", () => {
  it("lit les sessions par pages bornées et les révoque toutes (ADR 0008)", async () => {
    const prisma = createContextClient({ context: "identity", env: process.env });
    const { userId, sids } = await seedUserWithSessions(3);
    try {
      const store = prismaSessionRevocationStore(prisma, { pageSize: 2 });

      const revoked = await store.revokeAll({
        userId,
        reason: "refresh_token_reuse",
        userAgent: null,
      });

      expect(revoked).toEqual(sids);
      expect(await remainingSessionsOf(userId)).toEqual([]);
    } finally {
      await prisma.$disconnect();
    }
  });
});
