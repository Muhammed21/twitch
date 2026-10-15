import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createContextClient } from "@repo/db";

import { createAuthzContext, createAuthzRedis } from "../../authz/authz-context.ts";
import { createApp } from "../../create-app.ts";
import { toStreamEntry } from "../../platform/stream-entry.ts";
import { getStreamKey } from "./application/stream-keys.ts";
import { fakeLiveVideoProvider } from "./infrastructure/fake-live-video-provider.ts";
import { prismaStreamChannels } from "./infrastructure/prisma-stream-channels.ts";

const urlOf = (variable: string): string => {
  const url = process.env[variable];
  if (url === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return url;
};

const stream = createContextClient({ context: "stream", env: process.env });
const channelDb = createContextClient({ context: "channel", env: process.env });
const redis = createAuthzRedis(urlOf("REDIS_URL"));
const provider = fakeLiveVideoProvider({ webhookSecret: urlOf("VIDEO_WEBHOOK_SECRET") });

const seedChannel = async () => {
  const channel = await channelDb.channel.create({
    data: {
      id: randomUUID(),
      ownerId: randomUUID(),
      slug: `cle_${randomUUID().replaceAll("-", "").slice(0, 12)}`,
    },
  });
  await channelDb.authzRoleAssignment.create({
    data: {
      subjectId: channel.ownerId,
      role: "owner",
      scopeType: "channel",
      scopeId: channel.id,
      grantedBy: "svc:test-stream-keys",
    },
  });
  return channel;
};

const publishChannelCreated = (channel: { id: string; ownerId: string; slug: string }) =>
  redis.xAdd(
    "events.channel",
    "*",
    toStreamEntry({
      id: randomUUID(),
      name: "channel.created",
      version: 1,
      payload: { channelId: channel.id, ownerId: channel.ownerId, slug: channel.slug },
      occurredAt: new Date(),
    }),
  );

const withApi = async (run: (base: string) => Promise<void>, logSink: (line: string) => void) => {
  const { app } = await createApp({ env: process.env, logSink });
  await app.listen(0, "127.0.0.1");
  try {
    await run(`${await app.getUrl()}/v1`);
  } finally {
    await app.close();
  }
};

const readKey = getStreamKey({
  channels: prismaStreamChannels(stream),
  provider,
  authz: createAuthzContext({ prisma: stream, redis, now: () => new Date() }),
});

beforeAll(async () => {
  await redis.connect();
});

afterAll(async () => {
  redis.destroy();
  await stream.$disconnect();
  await channelDb.$disconnect();
});

describe("clé de stream (ADR 0001)", () => {
  it("provisionne le canal provider à la réception de channel.created, une seule fois", async () => {
    const channel = await seedChannel();
    const lines: string[] = [];

    await withApi(
      async () => {
        await publishChannelCreated(channel);
        await publishChannelCreated(channel);
        await vi.waitFor(
          async () =>
            expect(
              await stream.streamChannel.findMany({ where: { channelId: channel.id } }),
            ).toEqual([{ channelId: channel.id, providerChannelId: `fake-${channel.id}` }]),
          { timeout: 25_000, interval: 100 },
        );
      },
      (line) => lines.push(line),
    );
  });

  it("rend la clé au propriétaire et la refuse à un autre compte, d'après les attributions en base", async () => {
    const channel = await seedChannel();
    await prismaStreamChannels(stream).save({
      channelId: channel.id,
      providerChannelId: `fake-${channel.id}`,
    });

    const owner = await readKey({ actorId: channel.ownerId, channelId: channel.id });
    const other = await readKey({ actorId: randomUUID(), channelId: channel.id });

    expect(owner).toEqual({
      ok: true,
      value: {
        streamKey: expect.stringMatching(/^sk_live_[0-9a-f]{32}$/),
        ingestUrl: expect.any(String),
      },
    });
    expect(other).toEqual({ ok: false, error: "forbidden" });
  });

  it("garde la même clé d'un redémarrage à l'autre du provider factice", async () => {
    const channel = await seedChannel();
    const providerChannelId = `fake-${channel.id}`;

    const first = await provider.getStreamKey({ providerChannelId });
    const second = await fakeLiveVideoProvider({
      webhookSecret: urlOf("VIDEO_WEBHOOK_SECRET"),
    }).getStreamKey({ providerChannelId });

    expect(second).toEqual(first);
    expect(first?.ingestUrl).toBe("rtmp://127.0.0.1:1935/live");
    expect(await provider.getStreamKey({ providerChannelId: "inconnu" })).toBeNull();
  });

  it("donne une clé différente à chaque chaîne", async () => {
    const [first, second] = await Promise.all([seedChannel(), seedChannel()]);

    const keys = await Promise.all(
      [first, second].map((channel) =>
        provider.getStreamKey({ providerChannelId: `fake-${channel.id}` }),
      ),
    );

    expect(keys[0]?.streamKey).not.toBe(keys[1]?.streamKey);
  });

  it("n'expose la clé ni dans GET /v1/channels/{slug} ni dans les journaux de l'API", async () => {
    const channel = await seedChannel();
    const lines: string[] = [];

    await withApi(
      async (base) => {
        await publishChannelCreated(channel);
        await vi.waitFor(
          async () =>
            expect(
              await stream.streamChannel.findUnique({ where: { channelId: channel.id } }),
            ).not.toBeNull(),
          { timeout: 25_000, interval: 100 },
        );
        const credentials = await provider.getStreamKey({
          providerChannelId: `fake-${channel.id}`,
        });
        const page = await (await fetch(`${base}/channels/${channel.slug}`)).text();

        expect(credentials?.streamKey).toBeDefined();
        expect(page).not.toContain(credentials?.streamKey);
        expect(lines.join("\n")).not.toContain(credentials?.streamKey);
      },
      (line) => lines.push(line),
    );
  });
});
