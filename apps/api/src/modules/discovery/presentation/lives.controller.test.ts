import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import { rejectingVerifier } from "../../../platform/authentication.ts";
import { configureApp } from "../../../platform/configure-app.ts";
import { PlatformModule } from "../../../platform/platform.module.ts";
import type { ListedLive, ListLives, LivesRequest } from "../application/list-lives.ts";
import { LIST_LIVES, LivesController } from "./lives.controller.ts";

const CHANNEL_ID = "6f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
const STARTED_AT = new Date("2026-11-04T20:00:00.000Z");

const makeLive = (overrides: Partial<ListedLive> = {}): ListedLive => ({
  channelId: CHANNEL_ID,
  slug: "streamer",
  title: "Speedrun",
  startedAt: STARTED_AT,
  categoryId: null,
  ...overrides,
});

const withLives = async (
  items: readonly ListedLive[],
  run: (base: string, requests: LivesRequest[]) => Promise<void>,
) => {
  const requests: LivesRequest[] = [];
  const listLives: ListLives = async (request) => {
    requests.push(request);
    return { items, next: undefined };
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
    providers: [{ provide: LIST_LIVES, useValue: listLives }],
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
  it("donne à chaque live sa catégorie quand il en a une", async () => {
    const categorized = makeLive({
      categoryId: "1c6f5e4d-3b2a-4019-9f8e-7d6c5b4a3928",
      category: { slug: "irl", name: "IRL" },
      viewerCount: 12,
    });
    await withLives([categorized, makeLive()], async (base, requests) => {
      const body = await (await fetch(`${base}?limit=3`)).json();

      const live = {
        channelId: CHANNEL_ID,
        slug: "streamer",
        title: "Speedrun",
        startedAt: STARTED_AT.toISOString(),
      };
      expect(body).toEqual({
        items: [{ ...live, viewerCount: 12, category: { slug: "irl", name: "IRL" } }, live],
      });
      expect(requests).toEqual([{ after: undefined, limit: 3 }]);
    });
  });
});
