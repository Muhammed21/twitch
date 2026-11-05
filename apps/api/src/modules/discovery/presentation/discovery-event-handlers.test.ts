import { describe, expect, it } from "vitest";

import type { StreamEvent } from "../../../platform/stream-entry.ts";
import type { DiscoveryEvent } from "../domain/discovery-event.ts";
import { discoveryEventHandlers } from "./discovery-event-handlers.ts";

const CHANNEL_ID = "9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69";
const OWNER_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const SESSION_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const EVENT_ID = "0e1d2c3b-4a59-4687-9a1b-2c3d4e5f6a7b";
const CATEGORY_ID = "0b5e4d3c-2a19-4f08-8e7d-6c5b4a392817";
const TARGET_CATEGORY_ID = "1c6f5e4d-3b2a-4019-9f8e-7d6c5b4a3928";
const FOLLOWER_ID = "6b4c1e3a-9d5f-4a0c-b132-4e7f8a9b0c1d";

const PAYLOADS: Readonly<Record<string, unknown>> = {
  "channel.created": { channelId: CHANNEL_ID, ownerId: OWNER_ID, slug: "streamer" },
  "channel.metadata.updated": { channelId: CHANNEL_ID, title: "Speedrun" },
  "channel.category.created": { categoryId: CATEGORY_ID, slug: "irl", name: "IRL" },
  "channel.category.merged": {
    sourceCategoryId: CATEGORY_ID,
    targetCategoryId: TARGET_CATEGORY_ID,
  },
  "channel.category.retired": { categoryId: CATEGORY_ID },
  "channel.category.followed": {
    userId: FOLLOWER_ID,
    categoryId: CATEGORY_ID,
    followedAt: "2026-11-02T19:58:00.000Z",
    version: 3,
  },
  "channel.category.unfollowed": {
    userId: FOLLOWER_ID,
    categoryId: CATEGORY_ID,
    reason: "category_merged",
    version: 4,
  },
  "channel.category.updated": {
    categoryId: CATEGORY_ID,
    name: "IRL",
    imageKey: "images/category/irl.webp",
  },
  "stream.started": {
    sessionId: SESSION_ID,
    channelId: CHANNEL_ID,
    startedAt: "2026-11-02T20:00:00.000Z",
  },
  "stream.ended": {
    sessionId: SESSION_ID,
    channelId: CHANNEL_ID,
    endedAt: "2026-11-02T21:00:00.000Z",
  },
};

const makeEvent = (
  name: string,
  overrides: Partial<Pick<StreamEvent, "payload" | "version">> = {},
): StreamEvent => ({
  id: EVENT_ID,
  name,
  version: 1,
  occurredAt: new Date("2026-11-02T19:58:00.000Z"),
  payload: PAYLOADS[name],
  ...overrides,
});

const setup = () => {
  const projected: { eventId: string; event: DiscoveryEvent }[] = [];
  const lines: unknown[] = [];
  const handlers = discoveryEventHandlers({
    project: async (input) => {
      projected.push(input);
    },
    logSink: (line) => lines.push(JSON.parse(line)),
  });
  const handle = (event: StreamEvent) => {
    const handler = handlers[event.name];
    if (handler === undefined) {
      throw new Error(`handler ${event.name} absent`);
    }
    return handler(event);
  };
  return { handlers, projected, lines, handle };
};

describe("handlers de discovery pour events.channel et events.stream", () => {
  it("traite la chaîne, ses catégories et ses sessions, et rien d'autre", () => {
    expect(Object.keys(setup().handlers).toSorted()).toEqual([
      "channel.category.created",
      "channel.category.followed",
      "channel.category.merged",
      "channel.category.retired",
      "channel.category.unfollowed",
      "channel.category.updated",
      "channel.created",
      "channel.metadata.updated",
      "stream.ended",
      "stream.started",
    ]);
  });

  it.each<[string, DiscoveryEvent]>([
    ["channel.created", { kind: "channel-created", channelId: CHANNEL_ID, slug: "streamer" }],
    [
      "channel.metadata.updated",
      {
        kind: "metadata-changed",
        channelId: CHANNEL_ID,
        title: "Speedrun",
        changedAt: new Date("2026-11-02T19:58:00.000Z"),
      },
    ],
    [
      "channel.category.created",
      { kind: "category-created", categoryId: CATEGORY_ID, slug: "irl", name: "IRL" },
    ],
    [
      "channel.category.merged",
      {
        kind: "category-merged",
        categoryId: CATEGORY_ID,
        targetCategoryId: TARGET_CATEGORY_ID,
      },
    ],
    ["channel.category.retired", { kind: "category-retired", categoryId: CATEGORY_ID }],
    [
      "channel.category.followed",
      {
        kind: "category-follow-changed",
        userId: FOLLOWER_ID,
        categoryId: CATEGORY_ID,
        following: true,
        version: 3,
      },
    ],
    [
      "channel.category.unfollowed",
      {
        kind: "category-follow-changed",
        userId: FOLLOWER_ID,
        categoryId: CATEGORY_ID,
        following: false,
        version: 4,
      },
    ],
    [
      "channel.category.updated",
      {
        kind: "category-updated",
        categoryId: CATEGORY_ID,
        name: "IRL",
        imageKey: "images/category/irl.webp",
      },
    ],
    [
      "stream.started",
      {
        kind: "stream-started",
        channelId: CHANNEL_ID,
        sessionId: SESSION_ID,
        startedAt: new Date("2026-11-02T20:00:00.000Z"),
      },
    ],
    [
      "stream.ended",
      {
        kind: "stream-ended",
        channelId: CHANNEL_ID,
        sessionId: SESSION_ID,
        endedAt: new Date("2026-11-02T21:00:00.000Z"),
      },
    ],
  ])("projette %s, sans rien journaliser", async (name, expected) => {
    const { projected, lines, handle } = setup();

    await handle(makeEvent(name));

    expect(projected).toEqual([{ eventId: EVENT_ID, event: expected }]);
    expect(lines).toEqual([]);
  });

  it.each([
    ["une catégorie", CATEGORY_ID],
    ["l'absence de catégorie", null],
  ])("projette avec le titre %s portée par channel.metadata.updated", async (_name, categoryId) => {
    const { projected, handle } = setup();

    await handle(
      makeEvent("channel.metadata.updated", {
        payload: { channelId: CHANNEL_ID, title: "Speedrun", categoryId },
      }),
    );

    expect(projected).toEqual([
      {
        eventId: EVENT_ID,
        event: {
          kind: "metadata-changed",
          channelId: CHANNEL_ID,
          title: "Speedrun",
          categoryId,
          changedAt: new Date("2026-11-02T19:58:00.000Z"),
        },
      },
    ]);
  });

  it.each(Object.keys(PAYLOADS))(
    "laisse en attente %s dans une version qu'il ne gère pas",
    async (name) => {
      const { projected, handle } = setup();

      await expect(handle(makeEvent(name, { version: 2 }))).rejects.toThrow(
        new Error(`${name} version 2 non gérée`),
      );
      expect(projected).toEqual([]);
    },
  );

  it.each(Object.keys(PAYLOADS))(
    "écarte et journalise %s hors contrat, sans le projeter",
    async (name) => {
      const { projected, lines, handle } = setup();

      await handle(makeEvent(name, { payload: { channelId: "pas-un-uuid" } }));

      expect(projected).toEqual([]);
      expect(lines).toEqual([
        expect.objectContaining({
          level: "error",
          msg: "event écarté : payload hors contrat",
          event: name,
          eventId: EVENT_ID,
        }),
      ]);
    },
  );

  it("laisse remonter un échec de la projection, pour que l'event soit relu", async () => {
    const handlers = discoveryEventHandlers({
      project: async () => {
        throw new Error("base indisponible");
      },
      logSink: () => {},
    });

    await expect(handlers["stream.started"]?.(makeEvent("stream.started"))).rejects.toThrow(
      "base indisponible",
    );
  });
});
