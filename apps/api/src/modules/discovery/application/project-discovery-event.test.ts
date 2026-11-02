import { describe, expect, it } from "vitest";

import type { LiveChannelView } from "../domain/live-channel-view.ts";
import { type LiveChannelProjection, projectDiscoveryEvent } from "./project-discovery-event.ts";

const CHANNEL_ID = "6f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
const EVENT_ID = "0e1d2c3b-4a59-4687-9a1b-2c3d4e5f6a7b";

const UNKNOWN_CHANNEL: LiveChannelView = {
  channelId: CHANNEL_ID,
  slug: null,
  title: "",
  live: null,
  lastEndedAt: null,
};

const inMemoryProjection = () => {
  const updates: { eventId: string; channelId: string; result: LiveChannelView }[] = [];
  const projection: LiveChannelProjection = {
    update: async ({ eventId, channelId, change }) => {
      updates.push({ eventId, channelId, result: change(UNKNOWN_CHANNEL) });
    },
  };
  return { projection, updates };
};

describe("projection d'un event de discovery", () => {
  it("met à jour la vue de la chaîne de l'event, sous l'identifiant de l'event", async () => {
    const { projection, updates } = inMemoryProjection();

    await projectDiscoveryEvent(projection)({
      eventId: EVENT_ID,
      event: { kind: "channel-created", channelId: CHANNEL_ID, slug: "chaine" },
    });

    expect(updates).toEqual([
      { eventId: EVENT_ID, channelId: CHANNEL_ID, result: { ...UNKNOWN_CHANNEL, slug: "chaine" } },
    ]);
  });
});
