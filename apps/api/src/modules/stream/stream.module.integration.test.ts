import { randomUUID } from "node:crypto";
import { hostname } from "node:os";

import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { AccessTokenIdentity } from "@repo/auth-verifier";
import { createContextClient } from "@repo/db";
import { ok } from "@repo/result";

import { createAuthzRedis } from "../../authz/authz-context.ts";
import type { AccessTokenVerifier } from "../../platform/authentication.ts";
import { configureApp } from "../../platform/configure-app.ts";
import { PlatformModule } from "../../platform/platform.module.ts";
import { createStreamConsumerRedis } from "../../platform/stream-consumer.ts";
import { StreamModule } from "./stream.module.ts";

const urlOf = (variable: string): string => {
  const url = process.env[variable];
  if (url === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return url;
};

const channelDb = createContextClient({ context: "channel", env: process.env });
const stream = createContextClient({ context: "stream", env: process.env });
const admin = createAuthzRedis(urlOf("REDIS_URL"));

const verifierFor = (userId: string): AccessTokenVerifier => ({
  verify: async () =>
    ok({
      userId,
      sid: "sid-1",
      scopes: [],
      authTime: null,
      amr: [],
      revocation: "checked",
    } satisfies AccessTokenIdentity),
});

const withStreamModule = async (
  actorId: string,
  run: (base: string, logs: string[]) => Promise<void>,
) => {
  const logs: string[] = [];
  const authzRedis = createAuthzRedis(urlOf("REDIS_URL"));
  const consumerRedis = createStreamConsumerRedis(urlOf("REDIS_URL"));
  await Promise.all([authzRedis.connect(), consumerRedis.connect()]);
  const moduleRef = await Test.createTestingModule({
    imports: [
      PlatformModule.register({
        schemaVersionCheck: async () => {},
        logSink: (line) => logs.push(line),
        accessTokenVerifier: verifierFor(actorId),
      }),
      StreamModule.register({
        prisma: createContextClient({ context: "stream", env: process.env }),
        webhookSecret: urlOf("VIDEO_WEBHOOK_SECRET"),
        authzRedis,
        consumerRedis,
        logSink: (line) => logs.push(line),
      }),
    ],
  }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.listen(0, "127.0.0.1");
  try {
    await run(`${await app.getUrl()}/v1`, logs);
  } finally {
    await app.close();
    authzRedis.destroy();
  }
};

const seedProvisionedChannel = async (assignment: { expiresAt?: Date } = {}) => {
  const ownerId = randomUUID();
  const channelId = randomUUID();
  await channelDb.authzRoleAssignment.create({
    data: {
      subjectId: ownerId,
      role: "owner",
      scopeType: "channel",
      scopeId: channelId,
      grantedBy: "svc:test-stream-module",
    },
  });
  await stream.streamChannel.create({
    data: { channelId, providerChannelId: `fake-${channelId}` },
  });
  if (assignment.expiresAt !== undefined) {
    await channelDb.authzRoleAssignment.create({
      data: {
        subjectId: ownerId,
        role: "banned",
        scopeType: "channel",
        scopeId: channelId,
        grantedBy: "svc:test-stream-module",
        expiresAt: assignment.expiresAt,
      },
    });
  }
  return { ownerId, channelId };
};

beforeAll(async () => {
  await admin.connect();
});

afterAll(async () => {
  admin.destroy();
  await stream.$disconnect();
  await channelDb.$disconnect();
});

describe("StreamModule branché sur la base et Redis", () => {
  it("rend la clé de stream au propriétaire", async () => {
    const { ownerId, channelId } = await seedProvisionedChannel();

    await withStreamModule(ownerId, async (base) => {
      const response = await fetch(`${base}/channels/${channelId}/stream-key`, {
        headers: { authorization: "Bearer jeton" },
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        streamKey: expect.stringMatching(/^sk_live_[0-9a-f]{32}$/),
        ingestUrl: "rtmp://127.0.0.1:1935/live",
      });
    });
  });

  it("change la clé de stream du propriétaire : la lecture suivante rend la nouvelle", async () => {
    const { ownerId, channelId } = await seedProvisionedChannel();
    const withToken = { headers: { authorization: "Bearer jeton" } };

    await withStreamModule(ownerId, async (base) => {
      const before = await (
        await fetch(`${base}/channels/${channelId}/stream-key`, withToken)
      ).json();
      const rotation = await fetch(`${base}/channels/${channelId}/stream-key/rotate`, {
        method: "POST",
        ...withToken,
      });
      const rotated = await rotation.json();
      const after = await (
        await fetch(`${base}/channels/${channelId}/stream-key`, withToken)
      ).json();

      expect(rotation.status).toBe(200);
      expect(rotated).toEqual({
        streamKey: expect.stringMatching(/^sk_live_[0-9a-f]{32}$/),
        ingestUrl: "rtmp://127.0.0.1:1935/live",
      });
      expect(rotated).not.toEqual(before);
      expect(after).toEqual(rotated);
    });
  });

  it("refuse la rotation à un autre compte", async () => {
    const { channelId } = await seedProvisionedChannel();

    await withStreamModule(randomUUID(), async (base) => {
      const response = await fetch(`${base}/channels/${channelId}/stream-key/rotate`, {
        method: "POST",
        headers: { authorization: "Bearer jeton" },
      });

      expect(response.status).toBe(403);
    });
  });

  it("refuse la clé à un autre compte", async () => {
    const { channelId } = await seedProvisionedChannel();

    await withStreamModule(randomUUID(), async (base) => {
      const response = await fetch(`${base}/channels/${channelId}/stream-key`, {
        headers: { authorization: "Bearer jeton" },
      });

      expect(response.status).toBe(403);
    });
  });

  it("refuse la clé à un propriétaire banni pour encore une heure", async () => {
    const { ownerId, channelId } = await seedProvisionedChannel({
      expiresAt: new Date(Date.now() + 3_600_000),
    });

    await withStreamModule(ownerId, async (base) => {
      const response = await fetch(`${base}/channels/${channelId}/stream-key`, {
        headers: { authorization: "Bearer jeton" },
      });

      expect(response.status).toBe(403);
    });
  });

  it("consomme events.channel dans le groupe stream, sous le nom <machine>-<pid>", async () => {
    const consumer = `${hostname()}-${process.pid}`;
    await admin.xGroupDelConsumer("events.channel", "stream", consumer).catch(() => 0);

    await withStreamModule(randomUUID(), async () => {
      await vi.waitFor(
        async () =>
          expect(await admin.xInfoConsumers("events.channel", "stream")).toContainEqual(
            expect.objectContaining({ name: consumer }),
          ),
        { timeout: 10_000, interval: 100 },
      );
    });
  });

  it("journalise une entrée illisible de events.channel", async () => {
    const entryId = await admin.xAdd("events.channel", "*", { name: "sans le reste" });

    await withStreamModule(randomUUID(), async (_base, logs) => {
      await vi.waitFor(
        () =>
          expect(logs.map((line) => JSON.parse(line))).toContainEqual(
            expect.objectContaining({
              level: "error",
              msg: "consommation de stream en échec",
              stream: "events.channel",
              entryId,
              error: "entrée illisible",
            }),
          ),
        { timeout: 25_000, interval: 100 },
      );
    });
  });
});
