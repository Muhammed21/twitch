import { describe, expect, it } from "vitest";

import { applyCategoryEvent, type CategoryView } from "../domain/category-view.ts";
import {
  isAccountAvatarEvent,
  isCategoryEvent,
  isCategoryFollowEvent,
} from "../domain/discovery-event.ts";
import { applyDiscoveryEvent, type LiveChannelView } from "../domain/live-channel-view.ts";
import { DISCOVERY_EVENT_READERS } from "./read-discovery-event.ts";
import {
  type HistoryEvent,
  type RebuiltProjection,
  rebuildLiveChannelViews,
} from "./rebuild-live-channel-views.ts";

const CHANNEL_A = "6f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
const CHANNEL_B = "7a2d3e4f-5b6c-4d7e-9f80-a1b2c3d4e5f6";
const SESSION_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const OWNER_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const IRL = "0b5e4d3c-2a19-4f08-8e7d-6c5b4a392817";
const TALK = "1c6f5e4d-3b2a-4019-9f8e-7d6c5b4a3928";
const FOLLOWER = "6b4c1e3a-9d5f-4a0c-b132-4e7f8a9b0c1d";
const FORMER_FOLLOWER = "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e";

const makeHistoryEvent = (
  index: number,
  name: string,
  payload: unknown,
  version = 1,
): HistoryEvent => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  name,
  version,
  payload,
  occurredAt: new Date(Date.UTC(2026, 10, 2, 20, index)),
});

const HISTORY: readonly HistoryEvent[] = [
  makeHistoryEvent(1, "channel.created", {
    channelId: CHANNEL_A,
    ownerId: OWNER_ID,
    slug: "chaine_a",
  }),
  makeHistoryEvent(2, "channel.created", {
    channelId: CHANNEL_B,
    ownerId: OWNER_ID,
    slug: "chaine_b",
  }),
  makeHistoryEvent(3, "channel.metadata.updated", { channelId: CHANNEL_A, title: "Speedrun" }),
  makeHistoryEvent(4, "stream.started", {
    sessionId: SESSION_ID,
    channelId: CHANNEL_A,
    startedAt: "2026-11-02T20:04:00.000Z",
  }),
  makeHistoryEvent(5, "stream.ended", {
    sessionId: SESSION_ID,
    channelId: CHANNEL_B,
    endedAt: "2026-11-02T20:05:00.000Z",
  }),
];

const pagedHistory = (events: readonly HistoryEvent[], pageSize: number) => {
  const pages: (string | undefined)[] = [];
  return {
    pages,
    history: {
      page: async ({ after }: { after: HistoryEvent | undefined }) => {
        pages.push(after?.id);
        const start = after === undefined ? 0 : events.indexOf(after) + 1;
        return events.slice(start, start + pageSize);
      },
    },
  };
};

const rebuildWith = async (events: readonly HistoryEvent[], pageSize = 2) => {
  const written: RebuiltProjection[] = [];
  const { history, pages } = pagedHistory(events, pageSize);
  const report = await rebuildLiveChannelViews({
    history,
    pageSize,
    store: {
      replaceAll: async (compute) => {
        const projection = await compute();
        written.push(projection);
        return projection;
      },
    },
  });
  return { report, written, pages };
};

const decodedFrom = (events: readonly HistoryEvent[]) =>
  events.flatMap((event) => {
    const decoded = DISCOVERY_EVENT_READERS[event.name]?.(event);
    return decoded === undefined || decoded === null ? [] : [decoded];
  });

const consumedOneByOne = (events: readonly HistoryEvent[]): readonly LiveChannelView[] => {
  const views = decodedFrom(events).reduce<ReadonlyMap<string, LiveChannelView>>(
    (acc, decoded) =>
      isCategoryEvent(decoded) || isCategoryFollowEvent(decoded) || isAccountAvatarEvent(decoded)
        ? acc
        : new Map([
            ...acc,
            [decoded.channelId, applyDiscoveryEvent(acc.get(decoded.channelId) ?? null, decoded)],
          ]),
    new Map(),
  );
  return [...views.values()];
};

const categoriesConsumedOneByOne = (events: readonly HistoryEvent[]): readonly CategoryView[] => {
  const views = decodedFrom(events).reduce<ReadonlyMap<string, CategoryView>>(
    (acc, decoded) =>
      isCategoryEvent(decoded)
        ? new Map([
            ...acc,
            [decoded.categoryId, applyCategoryEvent(acc.get(decoded.categoryId) ?? null, decoded)],
          ])
        : acc,
    new Map(),
  );
  return [...views.values()];
};

const CATEGORY_HISTORY: readonly HistoryEvent[] = [
  makeHistoryEvent(11, "channel.category.created", { categoryId: IRL, slug: "irl", name: "IRL" }),
  makeHistoryEvent(12, "channel.category.created", {
    categoryId: TALK,
    slug: "talk",
    name: "Talk",
  }),
  makeHistoryEvent(13, "channel.metadata.updated", {
    channelId: CHANNEL_A,
    title: "Speedrun",
    categoryId: IRL,
  }),
  makeHistoryEvent(14, "channel.category.merged", {
    sourceCategoryId: IRL,
    targetCategoryId: TALK,
  }),
];

const FOLLOW_HISTORY: readonly HistoryEvent[] = [
  makeHistoryEvent(21, "channel.category.followed", {
    userId: FOLLOWER,
    categoryId: IRL,
    followedAt: "2026-11-02T20:21:00.000Z",
    version: 1,
  }),
  makeHistoryEvent(22, "channel.category.followed", {
    userId: FORMER_FOLLOWER,
    categoryId: IRL,
    followedAt: "2026-11-02T20:22:00.000Z",
    version: 1,
  }),
  makeHistoryEvent(23, "channel.category.unfollowed", {
    userId: FORMER_FOLLOWER,
    categoryId: IRL,
    reason: "unfollowed",
    version: 2,
  }),
];

describe("reconstruction de la projection LiveChannelView", () => {
  it("reconstruit la dernière version de chaque paire suivie (ADR 0049 §6)", async () => {
    const { written } = await rebuildWith([...HISTORY, ...FOLLOW_HISTORY]);

    expect(written[0]?.follows).toEqual([
      { userId: FOLLOWER, categoryId: IRL, following: true, version: 1 },
      { userId: FORMER_FOLLOWER, categoryId: IRL, following: false, version: 2 },
    ]);
    expect(written[0]?.views).toEqual(consumedOneByOne(HISTORY));
    expect(written[0]?.categories).toEqual([]);
  });

  it("garde la version la plus haute d'une paire, même lue avant une plus basse", async () => {
    const [followed, , unfollowed] = FOLLOW_HISTORY;
    const late = makeHistoryEvent(24, "channel.category.followed", {
      userId: FORMER_FOLLOWER,
      categoryId: IRL,
      followedAt: "2026-11-02T20:22:00.000Z",
      version: 1,
    });

    const { written } = await rebuildWith(
      [followed, unfollowed, late].filter((event) => event !== undefined),
    );

    expect(written[0]?.follows).toContainEqual({
      userId: FORMER_FOLLOWER,
      categoryId: IRL,
      following: false,
      version: 2,
    });
  });

  it("redonne la projection que les consommateurs construisent event par event", async () => {
    const { written } = await rebuildWith(HISTORY);

    expect(written).toHaveLength(1);
    expect(written[0]?.views).toEqual(consumedOneByOne(HISTORY));
    expect(written[0]?.views).toHaveLength(2);
  });

  it("reconstruit les catégories et la catégorie de chaque chaîne", async () => {
    const events = [...HISTORY, ...CATEGORY_HISTORY];

    const { written, report } = await rebuildWith(events);

    expect(written[0]?.views).toEqual(consumedOneByOne(events));
    expect(written[0]?.categories).toEqual(categoriesConsumedOneByOne(events));
    expect(written[0]?.categories).toHaveLength(2);
    expect(written[0]?.eventIds).toEqual(events.map((event) => event.id));
    expect(report).toEqual({ channels: 2, categories: 2, events: 9, skipped: 0 });
  });

  it("lit tout l'historique, page après page, jusqu'à une page incomplète", async () => {
    const { pages } = await rebuildWith(HISTORY, 2);

    expect(pages).toEqual([undefined, HISTORY[1]?.id, HISTORY[3]?.id]);
  });

  it("relit après une page pleine, même si elle était la dernière", async () => {
    const { pages, written } = await rebuildWith(HISTORY.slice(0, 4), 2);

    expect(pages).toEqual([undefined, HISTORY[1]?.id, HISTORY[3]?.id]);
    expect(written[0]?.eventIds).toHaveLength(4);
  });

  it("reprend après le dernier event de chaque page, sans en relire aucun", async () => {
    const { pages, written } = await rebuildWith(HISTORY, 3);

    expect(pages).toEqual([undefined, HISTORY[2]?.id]);
    expect(written[0]?.eventIds).toEqual(HISTORY.map((event) => event.id));
  });

  it("marque traités tous les events projetés, pour que les consommateurs ne les rejouent pas", async () => {
    const { written } = await rebuildWith(HISTORY);

    expect(written[0]?.eventIds).toEqual(HISTORY.map((event) => event.id));
  });

  it("ignore les events que discovery ne lit pas", async () => {
    const other = makeHistoryEvent(6, "channel.archived", { channelId: CHANNEL_A });

    const { written, report } = await rebuildWith([...HISTORY, other]);

    expect(written[0]?.views).toEqual(consumedOneByOne(HISTORY));
    expect(written[0]?.eventIds).not.toContain(other.id);
    expect(report).toEqual({ channels: 2, categories: 0, events: 5, skipped: 0 });
  });

  it("laisse l'avatar d'un compte à sa copie, qu'aucune reconstruction ne remplace", async () => {
    const avatar = makeHistoryEvent(6, "identity.avatar.changed", {
      accountId: OWNER_ID,
      avatarKey: "images/avatar/a.webp",
    });

    const { written, report } = await rebuildWith([...HISTORY, avatar]);

    expect(written[0]?.views).toEqual(consumedOneByOne(HISTORY));
    expect(written[0]?.eventIds).not.toContain(avatar.id);
    expect(report).toEqual({ channels: 2, categories: 0, events: 5, skipped: 0 });
  });

  it("écarte et compte un event hors contrat, sans le marquer traité", async () => {
    const malformed = makeHistoryEvent(6, "stream.started", { channelId: CHANNEL_A });

    const { written, report } = await rebuildWith([...HISTORY, malformed]);

    expect(written[0]?.eventIds).not.toContain(malformed.id);
    expect(report).toEqual({ channels: 2, categories: 0, events: 5, skipped: 1 });
  });

  it("s'arrête sans rien écrire sur une version d'event qu'il ne gère pas", async () => {
    const unsupported = makeHistoryEvent(6, "stream.started", {}, 2);

    await expect(rebuildWith([...HISTORY, unsupported])).rejects.toThrow(
      "stream.started version 2 non gérée",
    );
  });

  it("reconstruit 20 000 chaînes en moins d'une seconde", async () => {
    const events = Array.from({ length: 20_000 }, (_, index) =>
      makeHistoryEvent(index, "channel.created", {
        channelId: `00000000-0000-4000-9000-${String(index).padStart(12, "0")}`,
        ownerId: OWNER_ID,
        slug: `chaine_${index}`,
      }),
    );
    const startedAt = performance.now();

    const { report } = await rebuildWith(events, 500);

    expect(performance.now() - startedAt).toBeLessThan(1000);
    expect(report).toEqual({ channels: 20_000, categories: 0, events: 20_000, skipped: 0 });
  });

  it("vide la projection quand l'historique est vide", async () => {
    const { written, report, pages } = await rebuildWith([]);

    expect(written).toEqual([{ views: [], categories: [], follows: [], eventIds: [], skipped: 0 }]);
    expect(report).toEqual({ channels: 0, categories: 0, events: 0, skipped: 0 });
    expect(pages).toEqual([undefined]);
  });
});
