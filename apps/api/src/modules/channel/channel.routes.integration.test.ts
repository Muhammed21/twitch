import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createContextClient } from "@repo/db";

import { createAuthzContext, createAuthzRedis } from "../../authz/authz-context.ts";
import { createApp } from "../../create-app.ts";
import { updateChannel } from "./application/channel-queries.ts";
import { createChannelForAccount } from "./application/create-channel-for-account.ts";
import { createBannerUrlReader } from "./channel.module.ts";
import {
  prismaBannerStore,
  prismaChannelDirectory,
} from "./infrastructure/prisma-channel-directory.ts";
import { prismaChannelRegistry } from "./infrastructure/prisma-channel-registry.ts";
import { redisOwnerAssignmentsCache } from "./infrastructure/redis-owner-assignments-cache.ts";

const urlOf = (variable: string): string => {
  const url = process.env[variable];
  if (url === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return url;
};

const NOW = new Date("2026-10-15T12:00:00.000Z");

const prisma = createContextClient({ context: "channel", env: process.env });
const redis = createAuthzRedis(urlOf("REDIS_URL"));
const directory = prismaChannelDirectory(prisma);

const seedChannel = async () => {
  const ownerId = randomUUID();
  const outcome = await createChannelForAccount({
    registry: prismaChannelRegistry(prisma),
    cache: redisOwnerAssignmentsCache(redis),
    newId: randomUUID,
    now: () => NOW,
  })({
    eventId: randomUUID(),
    accountId: ownerId,
    displayName: `Chaine ${randomUUID().slice(0, 8)}`,
  });
  const channel = await prisma.channel.findUniqueOrThrow({ where: { ownerId } });
  expect(outcome).toMatchObject({ status: "created" });
  return channel;
};

const rename = updateChannel({
  directory,
  authz: createAuthzContext({ prisma, redis, now: () => NOW }),
  newId: randomUUID,
  now: () => NOW,
});

const metadataEventsOf = async (channelId: string) =>
  (await prisma.channelOutbox.findMany({ where: { name: "channel.metadata.updated" } })).filter(
    (row) =>
      typeof row.payload === "object" &&
      row.payload !== null &&
      "channelId" in row.payload &&
      row.payload.channelId === channelId,
  );

beforeAll(async () => {
  await redis.connect();
});

afterAll(async () => {
  redis.destroy();
  await prisma.$disconnect();
});

describe("lecture et modification d'une chaîne en base", () => {
  it("lit une chaîne par son slug et par son identifiant", async () => {
    const channel = await seedChannel();
    const view = {
      id: channel.id,
      slug: channel.slug,
      title: "",
      ownerId: channel.ownerId,
      category: null,
      bannerKey: null,
      tags: [],
      language: null,
      contentLabels: [],
      isBrandedContent: false,
    };

    expect(await directory.findBySlug(channel.slug)).toEqual(view);
    expect(await directory.findById(channel.id)).toEqual(view);
  });

  it("ne trouve ni un slug ni un identifiant inconnus", async () => {
    expect(await directory.findBySlug(`inconnue_${randomUUID().slice(0, 8)}`)).toBeNull();
    expect(await directory.findById(randomUUID())).toBeNull();
  });

  it("change le titre du propriétaire et écrit channel.metadata.updated dans la même transaction", async () => {
    const channel = await seedChannel();

    const outcome = await rename({
      actorId: channel.ownerId,
      channelId: channel.id,
      title: " Speedrun du dimanche ",
    });

    expect(outcome).toEqual({
      ok: true,
      value: {
        id: channel.id,
        slug: channel.slug,
        title: "Speedrun du dimanche",
        ownerId: channel.ownerId,
        category: null,
        bannerKey: null,
        tags: [],
        language: null,
        contentLabels: [],
        isBrandedContent: false,
      },
    });
    expect(await prisma.channel.findUnique({ where: { id: channel.id } })).toMatchObject({
      title: "Speedrun du dimanche",
    });
    expect(await metadataEventsOf(channel.id)).toEqual([
      expect.objectContaining({
        version: 1,
        payload: { channelId: channel.id, title: "Speedrun du dimanche", categoryId: null },
        occurredAt: NOW,
        publishedAt: null,
      }),
    ]);
  });

  it("enregistre les infos du stream, puis les garde quand seul le titre change", async () => {
    const channel = await seedChannel();

    await rename({
      actorId: channel.ownerId,
      channelId: channel.id,
      tags: ["Français", "SpeedRun"],
      language: "fr",
      contentLabels: ["profanity", "gambling"],
      isBrandedContent: true,
    });
    const outcome = await rename({
      actorId: channel.ownerId,
      channelId: channel.id,
      title: "Titre",
    });

    expect(outcome).toMatchObject({
      ok: true,
      value: {
        title: "Titre",
        tags: ["francais", "speedrun"],
        language: "fr",
        contentLabels: ["gambling", "profanity"],
        isBrandedContent: true,
      },
    });
    expect(await directory.findById(channel.id)).toEqual(outcome.ok ? outcome.value : undefined);
  });

  it("refuse le titre à un autre compte, d'après les attributions en base", async () => {
    const channel = await seedChannel();

    const outcome = await rename({
      actorId: randomUUID(),
      channelId: channel.id,
      title: "Pris en otage",
    });

    expect(outcome).toEqual({ ok: false, error: "forbidden" });
    expect(await prisma.channel.findUnique({ where: { id: channel.id } })).toMatchObject({
      title: "",
    });
    expect(await metadataEventsOf(channel.id)).toEqual([]);
  });
});

describe("routes de channel montées dans l'API", () => {
  it("sert GET /v1/channels/{slug} sans jeton, et protège PATCH /v1/channels/{id}", async () => {
    const channel = await seedChannel();
    const { app } = await createApp({ env: process.env, logSink: () => {} });
    await app.listen(0, "127.0.0.1");
    try {
      const base = `${await app.getUrl()}/v1/channels`;

      const read = await fetch(`${base}/${channel.slug}`);
      const update = await fetch(`${base}/${channel.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Sans jeton" }),
      });

      expect(read.status).toBe(200);
      expect(await read.json()).toEqual({
        id: channel.id,
        slug: channel.slug,
        title: "",
        ownerId: channel.ownerId,
        tags: [],
        contentLabels: [],
        isBrandedContent: false,
      });
      expect(update.status).toBe(401);
    } finally {
      await app.close();
    }
  });

  it.each(["PUT", "DELETE"])(
    "monte %s /v1/me/followed-categories/{slug} derrière un jeton (ADR 0049)",
    async (method) => {
      const { app } = await createApp({ env: process.env, logSink: () => {} });
      await app.listen(0, "127.0.0.1");
      try {
        const response = await fetch(`${await app.getUrl()}/v1/me/followed-categories/x`, {
          method,
        });

        expect(response.status).toBe(401);
      } finally {
        await app.close();
      }
    },
  );
});

describe("enregistrement de la bannière en base", () => {
  const store = prismaBannerStore(prisma);
  const FIRST_KEY = "images/banner/premiere.webp";
  const SECOND_KEY = "images/banner/seconde.webp";

  it("ne trouve pas de chaîne pour un compte qui n'en a pas", async () => {
    expect(await store.saveBanner({ ownerId: randomUUID(), bannerKey: FIRST_KEY })).toEqual({
      ok: false,
      error: "channel_not_found",
    });
  });

  it("enregistre la première bannière de la chaîne, sans clé remplacée", async () => {
    const channel = await seedChannel();

    const outcome = await store.saveBanner({ ownerId: channel.ownerId, bannerKey: FIRST_KEY });

    expect(outcome).toEqual({
      ok: true,
      value: {
        channel: {
          id: channel.id,
          slug: channel.slug,
          title: "",
          ownerId: channel.ownerId,
          category: null,
          bannerKey: FIRST_KEY,
          tags: [],
          language: null,
          contentLabels: [],
          isBrandedContent: false,
        },
        replacedKey: undefined,
      },
    });
  });

  it("rend l'ancienne clé quand une bannière en remplace une autre", async () => {
    const channel = await seedChannel();
    await store.saveBanner({ ownerId: channel.ownerId, bannerKey: FIRST_KEY });

    const outcome = await store.saveBanner({ ownerId: channel.ownerId, bannerKey: SECOND_KEY });

    expect(outcome).toMatchObject({
      ok: true,
      value: { channel: { bannerKey: SECOND_KEY }, replacedKey: FIRST_KEY },
    });
    expect(await directory.findById(channel.id)).toMatchObject({ bannerKey: SECOND_KEY });
  });

  it("relit la clé de la bannière de la chaîne du compte", async () => {
    const channel = await seedChannel();
    await store.saveBanner({ ownerId: channel.ownerId, bannerKey: FIRST_KEY });

    expect(await store.readBannerKey(channel.ownerId)).toBe(FIRST_KEY);
  });

  it("relit l'absence de bannière, pour une chaîne sans bannière comme pour un compte sans chaîne", async () => {
    const channel = await seedChannel();

    expect(await store.readBannerKey(channel.ownerId)).toBeNull();
    expect(await store.readBannerKey(randomUUID())).toBeNull();
  });
});

describe("URL de la bannière de la chaîne d'un compte", () => {
  const BANNER_KEY = "images/banner/lue.webp";
  const bannerUrlOf = createBannerUrlReader({
    prisma,
    imageUrlOf: (key) => `https://images.invalid/${key}`,
  });

  it("rend l'URL publique de la bannière de la chaîne du compte", async () => {
    const channel = await seedChannel();
    await prismaBannerStore(prisma).saveBanner({ ownerId: channel.ownerId, bannerKey: BANNER_KEY });

    expect(await bannerUrlOf(channel.ownerId)).toBe(`https://images.invalid/${BANNER_KEY}`);
  });

  it("ne rend rien pour une chaîne sans bannière", async () => {
    const channel = await seedChannel();

    expect(await bannerUrlOf(channel.ownerId)).toBeUndefined();
  });

  it("ne rend rien pour un compte sans chaîne", async () => {
    expect(await bannerUrlOf(randomUUID())).toBeUndefined();
  });
});
