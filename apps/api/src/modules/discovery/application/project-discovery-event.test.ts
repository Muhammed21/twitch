import { describe, expect, it } from "vitest";

import type { CategoryFollowView } from "../domain/category-follow-view.ts";
import type { CategoryView } from "../domain/category-view.ts";
import type { LiveChannelView } from "../domain/live-channel-view.ts";
import {
  type CategoryFollowProjection,
  type CategoryProjection,
  type LiveChannelProjection,
  projectDiscoveryEvent,
} from "./project-discovery-event.ts";

const CHANNEL_ID = "6f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
const CATEGORY_ID = "0b5e4d3c-2a19-4f08-8e7d-6c5b4a392817";
const EVENT_ID = "0e1d2c3b-4a59-4687-9a1b-2c3d4e5f6a7b";
const FOLLOWER_ID = "6b4c1e3a-9d5f-4a0c-b132-4e7f8a9b0c1d";

const UNKNOWN_CHANNEL: LiveChannelView = {
  channelId: CHANNEL_ID,
  slug: null,
  title: "",
  titleChangedAt: null,
  categoryId: null,
  live: null,
  lastEndedAt: null,
};

const ACTIVE_CATEGORY: CategoryView = {
  categoryId: CATEGORY_ID,
  slug: "irl",
  name: "IRL",
  status: "active",
  mergedIntoId: null,
  imageKey: null,
  tags: [],
};

const inMemoryProjections = ({
  storedFollow = null,
}: { storedFollow?: CategoryFollowView | null } = {}) => {
  const followUpdates: {
    eventId: string;
    userId: string;
    categoryId: string;
    result: CategoryFollowView | null;
  }[] = [];
  const follows: CategoryFollowProjection = {
    update: async ({ eventId, userId, categoryId, change }) => {
      followUpdates.push({ eventId, userId, categoryId, result: change(storedFollow) });
    },
  };
  const channelUpdates: { eventId: string; channelId: string; result: LiveChannelView }[] = [];
  const categoryUpdates: { eventId: string; categoryId: string; result: CategoryView }[] = [];
  const channels: LiveChannelProjection = {
    update: async ({ eventId, channelId, change }) => {
      channelUpdates.push({ eventId, channelId, result: change(UNKNOWN_CHANNEL) });
    },
  };
  const categories: CategoryProjection = {
    update: async ({ eventId, categoryId, change }) => {
      categoryUpdates.push({ eventId, categoryId, result: change(ACTIVE_CATEGORY) });
    },
  };
  return {
    project: projectDiscoveryEvent({ channels, categories, follows }),
    channelUpdates,
    categoryUpdates,
    followUpdates,
  };
};

describe("projection d'un event de discovery", () => {
  it("met à jour la vue de la chaîne de l'event, sous l'identifiant de l'event", async () => {
    const { project, channelUpdates, categoryUpdates } = inMemoryProjections();

    await project({
      eventId: EVENT_ID,
      event: { kind: "channel-created", channelId: CHANNEL_ID, slug: "chaine" },
    });

    expect(channelUpdates).toEqual([
      { eventId: EVENT_ID, channelId: CHANNEL_ID, result: { ...UNKNOWN_CHANNEL, slug: "chaine" } },
    ]);
    expect(categoryUpdates).toEqual([]);
  });

  it("met à jour la vue de la catégorie de l'event, sous l'identifiant de l'event", async () => {
    const { project, channelUpdates, categoryUpdates } = inMemoryProjections();

    await project({
      eventId: EVENT_ID,
      event: { kind: "category-retired", categoryId: CATEGORY_ID },
    });

    expect(categoryUpdates).toEqual([
      {
        eventId: EVENT_ID,
        categoryId: CATEGORY_ID,
        result: { ...ACTIVE_CATEGORY, status: "retired" },
      },
    ]);
    expect(channelUpdates).toEqual([]);
  });

  it("met à jour la pochette de la catégorie, pas la vue d'une chaîne", async () => {
    const { project, channelUpdates, categoryUpdates } = inMemoryProjections();

    await project({
      eventId: EVENT_ID,
      event: {
        kind: "category-updated",
        categoryId: CATEGORY_ID,
        name: "IRL",
        imageKey: "images/category/irl.webp",
        tags: [],
      },
    });

    expect(categoryUpdates).toEqual([
      {
        eventId: EVENT_ID,
        categoryId: CATEGORY_ID,
        result: { ...ACTIVE_CATEGORY, imageKey: "images/category/irl.webp" },
      },
    ]);
    expect(channelUpdates).toEqual([]);
  });

  it("applique un suivi à la paire de l'event, avec la règle de version (ADR 0049 §6)", async () => {
    const { project, channelUpdates, categoryUpdates, followUpdates } = inMemoryProjections({
      storedFollow: { userId: FOLLOWER_ID, categoryId: CATEGORY_ID, following: true, version: 1 },
    });

    await project({
      eventId: EVENT_ID,
      event: {
        kind: "category-follow-changed",
        userId: FOLLOWER_ID,
        categoryId: CATEGORY_ID,
        following: false,
        version: 2,
      },
    });

    expect(followUpdates).toEqual([
      {
        eventId: EVENT_ID,
        userId: FOLLOWER_ID,
        categoryId: CATEGORY_ID,
        result: { userId: FOLLOWER_ID, categoryId: CATEGORY_ID, following: false, version: 2 },
      },
    ]);
    expect(categoryUpdates).toEqual([]);
    expect(channelUpdates).toEqual([]);
  });

  it("ne change pas la paire pour un event en retard", async () => {
    const { project, followUpdates } = inMemoryProjections({
      storedFollow: { userId: FOLLOWER_ID, categoryId: CATEGORY_ID, following: true, version: 3 },
    });

    await project({
      eventId: EVENT_ID,
      event: {
        kind: "category-follow-changed",
        userId: FOLLOWER_ID,
        categoryId: CATEGORY_ID,
        following: false,
        version: 2,
      },
    });

    expect(followUpdates.map(({ result }) => result)).toEqual([null]);
  });
});
