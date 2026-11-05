import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import { rejectingVerifier } from "../../../platform/authentication.ts";
import { configureApp } from "../../../platform/configure-app.ts";
import { PlatformModule } from "../../../platform/platform.module.ts";
import type {
  ListedLive,
  ListLives,
  LivePosition,
  LivesRequest,
} from "../application/list-lives.ts";
import { CATEGORY_IMAGE_URL } from "./category-image-url.ts";
import { encodeLiveCursor } from "./live-cursor.ts";
import { LIST_LIVES, LivesController } from "./lives.controller.ts";

const CHANNEL_ID = "6f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
const STARTED_AT = new Date("2026-11-04T20:00:00.000Z");

const makeLive = (overrides: Partial<ListedLive> = {}): ListedLive => ({
  channelId: CHANNEL_ID,
  slug: "streamer",
  title: "Speedrun",
  startedAt: STARTED_AT,
  categoryId: null,
  avatarKey: null,
  ...overrides,
});

const withLives = async (
  items: readonly ListedLive[],
  run: (base: string, requests: LivesRequest[]) => Promise<void>,
  next?: LivePosition,
) => {
  const requests: LivesRequest[] = [];
  const listLives: ListLives = async (request) => {
    requests.push(request);
    return { items, next };
  };
  const moduleRef = await Test.createTestingModule({
    imports: [
      PlatformModule.register({
        schemaVersionCheck: async () => {},
        logSink: () => {},
        accessTokenVerifier: rejectingVerifier,
      }),
    ],
    controllers: [LivesController],
    providers: [
      { provide: LIST_LIVES, useValue: listLives },
      { provide: CATEGORY_IMAGE_URL, useValue: (key: string) => `https://images.test/${key}` },
    ],
  }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.listen(0, "127.0.0.1");
  try {
    await run(`${await app.getUrl()}/v1/lives`, requests);
  } finally {
    await app.close();
  }
};

describe("GET /v1/lives", () => {
  it("donne à chaque live sa catégorie quand il en a une, avec sa pochette si elle existe", async () => {
    const categorized = makeLive({
      categoryId: "1c6f5e4d-3b2a-4019-9f8e-7d6c5b4a3928",
      category: { slug: "irl", name: "IRL", imageKey: "images/category/irl.webp" },
      viewerCount: 12,
    });
    const withoutCover = makeLive({
      categoryId: "3e8b7a6f-5d4c-4b3b-9b0a-9f8e7d6c5b4a",
      category: { slug: "art", name: "Art", imageKey: null },
    });
    await withLives([categorized, withoutCover, makeLive()], async (base, requests) => {
      const body = await (await fetch(`${base}?limit=3`)).json();

      const live = {
        channelId: CHANNEL_ID,
        slug: "streamer",
        title: "Speedrun",
        startedAt: STARTED_AT.toISOString(),
      };
      expect(body).toEqual({
        items: [
          {
            ...live,
            viewerCount: 12,
            category: {
              slug: "irl",
              name: "IRL",
              imageUrl: "https://images.test/images/category/irl.webp",
            },
          },
          { ...live, category: { slug: "art", name: "Art" } },
          live,
        ],
      });
      expect(requests).toEqual([{ after: undefined, limit: 3 }]);
    });
  });

  it("donne à un live l'avatar du propriétaire de sa chaîne quand il en a un", async () => {
    const withAvatar = makeLive({ avatarKey: "images/avatar/streamer.webp" });
    await withLives([withAvatar, makeLive()], async (base) => {
      const body = await (await fetch(`${base}?limit=2`)).json();

      expect(body.items.map((live: { avatarUrl?: string }) => live.avatarUrl)).toEqual([
        "https://images.test/images/avatar/streamer.webp",
        undefined,
      ]);
    });
  });

  it("rend le curseur de la page suivante", async () => {
    const next = { startedAt: STARTED_AT, channelId: CHANNEL_ID };
    await withLives(
      [makeLive()],
      async (base) => {
        expect(await (await fetch(base)).json()).toMatchObject({
          nextCursor: encodeLiveCursor(next),
        });
      },
      next,
    );
  });
});
