import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { createContextClient } from "@repo/db";

import { createApp } from "../../create-app.ts";
import { TIMEOUT_USER, type TimeoutUser } from "./presentation/timeouts.controller.ts";

const urlOf = (variable: string): string => {
  const url = process.env[variable];
  if (url === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return url;
};

const openModerationConnections = async () => {
  const client = new Client({ connectionString: urlOf("DATABASE_URL_MIGRATOR") });
  await client.connect();
  try {
    const { rows } = await client.query<{ open: string }>(
      "SELECT count(*) AS open FROM pg_stat_activity WHERE usename = 'app_moderation'",
    );
    return Number(rows[0]?.open);
  } finally {
    await client.end();
  }
};

const seedOwnedChannel = async ({ ownerTimedOutUntil }: { ownerTimedOutUntil?: Date } = {}) => {
  const prisma = createContextClient({ context: "moderation", env: process.env });
  const channel = { id: randomUUID(), ownerId: randomUUID() };
  const onChannel = {
    subjectId: channel.ownerId,
    scopeType: "channel",
    scopeId: channel.id,
  } as const;
  try {
    await prisma.authzRoleAssignment.create({
      data: { ...onChannel, role: "owner", grantedBy: "svc:test-moderation" },
    });
    if (ownerTimedOutUntil !== undefined) {
      await prisma.authzRoleAssignment.create({
        data: {
          ...onChannel,
          role: "banned",
          grantedBy: "svc:test-moderation",
          expiresAt: ownerTimedOutUntil,
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
  return channel;
};

const timeoutThroughApi = async (
  channel: { id: string; ownerId: string },
  check: (outcome: Awaited<ReturnType<TimeoutUser>>) => Promise<void>,
) => {
  const { app } = await createApp({ env: process.env, logSink: () => {} });
  try {
    const timeoutUser = app.get<symbol, TimeoutUser>(TIMEOUT_USER, { strict: false });
    await check(
      await timeoutUser({
        actorId: channel.ownerId,
        channelId: channel.id,
        targetId: randomUUID(),
        durationSeconds: 60,
      }),
    );
  } finally {
    await app.close();
  }
};

describe("module moderation monté dans l'API", () => {
  it("protège POST /v1/channels/{id}/timeouts par un jeton", async () => {
    const { app } = await createApp({ env: process.env, logSink: () => {} });
    await app.listen(0, "127.0.0.1");
    try {
      const response = await fetch(`${await app.getUrl()}/v1/channels/${randomUUID()}/timeouts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: randomUUID(), durationSeconds: 600 }),
      });

      expect(response.status).toBe(401);
    } finally {
      await app.close();
    }
  });

  it("met en timeout avec le client du contexte moderation, fermé à l'arrêt de l'API", async () => {
    const channel = await seedOwnedChannel();

    await timeoutThroughApi(channel, async (outcome) => {
      expect(outcome).toMatchObject({ ok: true, value: { cacheInvalidated: true } });
      expect(await openModerationConnections()).toBeGreaterThan(0);
    });

    expect(await openModerationConnections()).toBe(0);
  });

  it("refuse le timeout à un propriétaire lui-même en timeout sur sa chaîne, à l'heure courante", async () => {
    const channel = await seedOwnedChannel({
      ownerTimedOutUntil: new Date(Date.now() + 60 * 60 * 1000),
    });

    await timeoutThroughApi(channel, async (outcome) => {
      expect(outcome).toEqual({ ok: false, error: "forbidden" });
    });
  });
});
