import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { responses } from "@repo/contracts";
import { createContextClient } from "@repo/db";

import { createApp } from "../../create-app.ts";
import { buildOpenApiDocument } from "../../openapi/build-document.ts";
import { livePageQuery } from "./infrastructure/prisma-live-reader.ts";
import { encodeLiveCursor } from "./presentation/live-cursor.ts";

const urlOf = (variable: string): string => {
  const url = process.env[variable];
  if (url === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return url;
};

const discovery = createContextClient({ context: "discovery", env: process.env });

const inTheFuture = (minute: number): Date => new Date(Date.UTC(2099, 0, 1, 0, minute));

type SeededView = {
  channelId: string;
  slug: string | null;
  title: string;
  liveStartedAt: Date | null;
};

const seeded: string[] = [];

const seedLiveView = async ({
  minute,
  channelId = randomUUID(),
  slug = `live_${randomUUID().replaceAll("-", "").slice(0, 12)}`,
}: {
  minute: number;
  channelId?: string;
  slug?: string | null;
}): Promise<SeededView> => {
  const view = { channelId, slug, title: `Live ${minute}`, liveStartedAt: inTheFuture(minute) };
  await discovery.discoveryLiveChannelView.create({
    data: { ...view, liveSessionId: randomUUID() },
  });
  seeded.push(channelId);
  return view;
};

const endLive = (channelId: string) =>
  discovery.discoveryLiveChannelView.update({
    where: { channelId },
    data: { liveSessionId: null, liveStartedAt: null, lastEndedAt: new Date() },
  });

const asListed = ({ channelId, slug, title, liveStartedAt }: SeededView) => ({
  channelId,
  slug,
  title,
  startedAt: liveStartedAt?.toISOString(),
});

const state: { app?: INestApplication; url?: string } = {};

const appOf = (): INestApplication => {
  if (state.app === undefined) {
    throw new Error("API non démarrée");
  }
  return state.app;
};

const get = async (query: string) => {
  const response = await fetch(`${state.url}/v1/lives${query}`);
  const body: unknown = await response.json();
  return { status: response.status, type: response.headers.get("content-type"), body };
};

const page = async (query: string) => {
  const { status, body } = await get(query);
  expect(status).toBe(200);
  return responses.LivePage.parse(body);
};

const seedDescending = async (minutes: readonly number[]): Promise<readonly SeededView[]> =>
  minutes.reduce<Promise<readonly SeededView[]>>(
    async (previous, minute) => [...(await previous), await seedLiveView({ minute })],
    Promise.resolve([]),
  );

beforeAll(async () => {
  const { app } = await createApp({ env: process.env, logSink: () => {} });
  await app.listen(0, "127.0.0.1");
  state.app = app;
  state.url = await app.getUrl();
});

afterAll(async () => {
  await discovery.discoveryLiveChannelView.deleteMany({ where: { channelId: { in: seeded } } });
  await state.app?.close();
  await discovery.$disconnect();
});

const cleanUp = () =>
  discovery.discoveryLiveChannelView.deleteMany({ where: { channelId: { in: seeded } } });

describe("GET /v1/lives (jalon A3)", () => {
  it("liste les lives en cours dont le slug est connu, du plus récent au plus ancien, puis par chaîne", async () => {
    const latest = await seedLiveView({ minute: 30 });
    const tieFirst = await seedLiveView({
      minute: 20,
      channelId: "00000000-0000-4000-8000-000000000001",
    });
    const tieSecond = await seedLiveView({
      minute: 20,
      channelId: "00000000-0000-4000-8000-000000000002",
    });
    const oldest = await seedLiveView({ minute: 10 });
    await seedLiveView({ minute: 40, slug: null });
    const ended = await seedLiveView({ minute: 35 });
    await endLive(ended.channelId);

    try {
      expect((await page("?limit=4")).items).toEqual(
        [latest, tieFirst, tieSecond, oldest].map(asListed),
      );
    } finally {
      await cleanUp();
    }
  });

  it("retire de la liste un live qui se termine", async () => {
    const live = await seedLiveView({ minute: 50 });
    try {
      expect((await page("?limit=1")).items).toEqual([asListed(live)]);

      await endLive(live.channelId);

      expect((await page("?limit=1")).items).not.toContainEqual(asListed(live));
    } finally {
      await cleanUp();
    }
  });

  it("mène de page en page par nextCursor, dans l'ordre, sans doublon", async () => {
    const lives = await seedDescending([5, 4, 3, 2, 1]);
    try {
      const first = await page("?limit=2");
      const second = await page(`?limit=2&cursor=${first.nextCursor}`);
      const third = await page(`?limit=1&cursor=${second.nextCursor}`);

      expect([...first.items, ...second.items, ...third.items]).toEqual(lives.map(asListed));
    } finally {
      await cleanUp();
    }
  });

  it("utilise 20 lives par page sans limit", async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, index) => seedLiveView({ minute: 100 + index })),
    );
    const latest = await seedLiveView({ minute: 120 });
    try {
      const { items, nextCursor } = await page("");

      expect(items).toHaveLength(20);
      expect(items[0]).toEqual(asListed(latest));
      expect(nextCursor).toEqual(expect.any(String));
    } finally {
      await cleanUp();
    }
  });

  it("rend une page vide, sans curseur suivant, quand aucun live ne suit", async () => {
    const cursor = encodeLiveCursor({
      startedAt: new Date(0),
      channelId: "ffffffff-ffff-4fff-bfff-ffffffffffff",
    });

    expect(await page(`?cursor=${cursor}`)).toEqual({ items: [] });
  });

  it("accepte un curseur daté du premier jour de l'an 1", async () => {
    const cursor = encodeLiveCursor({
      startedAt: new Date("0001-01-01T00:00:00Z"),
      channelId: "ffffffff-ffff-4fff-bfff-ffffffffffff",
    });

    expect(await page(`?cursor=${cursor}`)).toEqual({ items: [] });
  });

  it("ne décale pas la page suivante quand un live démarre entre deux pages", async () => {
    const lives = await seedDescending([4, 3, 2, 1]);
    try {
      const first = await page("?limit=2");
      await seedLiveView({ minute: 9 });

      const second = await page(`?limit=2&cursor=${first.nextCursor}`);

      expect(second.items).toEqual(lives.slice(2).map(asListed));
    } finally {
      await cleanUp();
    }
  });

  it("reprend juste après le live du curseur, même s'il s'est terminé entre-temps", async () => {
    const lives = await seedDescending([4, 3, 2, 1]);
    try {
      const first = await page("?limit=2");
      await Promise.all(lives.slice(1, 2).map(({ channelId }) => endLive(channelId)));

      const second = await page(`?limit=2&cursor=${first.nextCursor}`);

      expect(second.items).toEqual(lives.slice(2).map(asListed));
    } finally {
      await cleanUp();
    }
  });

  it.each([
    ["qui n'est pas du base64url JSON", "?cursor=pas-un-curseur"],
    [
      "dont la position est illisible",
      `?cursor=${Buffer.from('["hier","42"]').toString("base64url")}`,
    ],
    [
      "daté d'une année qui n'existe pas",
      `?cursor=${Buffer.from('["0000-01-01T00:00:00Z","00000000-0000-4000-8000-000000000001"]').toString("base64url")}`,
    ],
  ])("refuse un curseur %s en nommant le curseur illisible", async (_, query) => {
    const { body } = await get(query);

    expect(responses.Problem.parse(body).errors).toEqual([
      { path: "cursor", message: "Curseur illisible" },
    ]);
  });

  it.each([
    ["cursor", "?cursor=pas-un-curseur"],
    ["cursor", `?cursor=${Buffer.from('["hier","42"]').toString("base64url")}`],
    [
      "cursor",
      `?cursor=${Buffer.from('["0000-01-01T00:00:00Z","00000000-0000-4000-8000-000000000001"]').toString("base64url")}`,
    ],
    ["limit", "?limit=0"],
    ["limit", "?limit=51"],
    ["limit", "?limit=2.5"],
    ["limit", "?limit=beaucoup"],
  ])("refuse en 400 RFC 9457 un paramètre %s invalide (%s)", async (parameter, query) => {
    const { status, type, body } = await get(query);

    expect(status).toBe(400);
    expect(type).toContain("application/problem+json");
    expect(responses.Problem.parse(body).errors).toContainEqual(
      expect.objectContaining({ path: parameter }),
    );
  });

  it("accepte les bornes de limit", async () => {
    expect((await get("?limit=1")).status).toBe(200);
    expect((await get("?limit=50")).status).toBe(200);
  });

  it("figure dans l'OpenAPI, avec LivePage", () => {
    expect(buildOpenApiDocument(appOf())).toMatchObject({
      paths: {
        "/v1/lives": {
          get: {
            responses: {
              200: {
                content: {
                  "application/json": { schema: { $ref: "#/components/schemas/LivePage" } },
                },
              },
            },
          },
        },
      },
    });
  });
});

const planOfLivePage = async (after: { startedAt: Date; channelId: string } | undefined) => {
  const client = new Client({ connectionString: urlOf("DATABASE_URL_MIGRATOR") });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      INSERT INTO "discovery"."DiscoveryLiveChannelView"
        ("channelId", "slug", "title", "liveSessionId", "liveStartedAt")
      SELECT gen_random_uuid(), 'volume_' || n, '',
             CASE WHEN n % 10 = 0 THEN gen_random_uuid() END,
             CASE WHEN n % 10 = 0 THEN timestamp '2026-01-01' + n * interval '1 second' END
        FROM generate_series(1, 50000) AS n
    `);
    await client.query(`ANALYZE "discovery"."DiscoveryLiveChannelView"`);
    const { text, values } = livePageQuery({ after, take: 21 });
    const { rows } = await client.query(`EXPLAIN (FORMAT JSON) ${text}`, [...values]);
    return JSON.stringify(rows);
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
};

describe("lecture des lives sur une projection volumineuse (ADR 0008 §b)", () => {
  it.each([
    ["la première page", undefined],
    [
      "une page au milieu de la liste",
      {
        startedAt: new Date("2026-01-01T06:00:00Z"),
        channelId: "00000000-0000-4000-8000-000000000000",
      },
    ],
  ])("lit %s par index, sans parcourir toute la vue", async (_, after) => {
    expect(await planOfLivePage(after)).not.toContain("Seq Scan");
  });
});
