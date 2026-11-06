import { describe, expect, it } from "vitest";

import type { ChannelLiveStatus, LiveStatusReader } from "./live-status-hub.ts";
import { withThumbnails } from "./live-status-thumbnails.ts";

const LIVE_CHANNEL = "00000000-0000-4000-8000-000000000001";
const OFFLINE_CHANNEL = "00000000-0000-4000-8000-000000000002";
const UNPROVISIONED_CHANNEL = "00000000-0000-4000-8000-000000000003";

const STARTED_AT = new Date("2026-11-06T08:32:42.000Z");
const LIVE_THUMBNAIL = "http://192.168.4.233:3002/hls/channels/provider-1/thumbnail.jpg";

const PROJECTION: readonly ChannelLiveStatus[] = [
  { channelId: LIVE_CHANNEL, startedAt: STARTED_AT, viewerCount: 1 },
  { channelId: OFFLINE_CHANNEL, startedAt: undefined },
  { channelId: UNPROVISIONED_CHANNEL, startedAt: STARTED_AT },
];

const statuses: LiveStatusReader = {
  read: async (channelIds) => PROJECTION.filter(({ channelId }) => channelIds.includes(channelId)),
};

const makeThumbnailUrls = () => {
  const reads: (readonly string[])[] = [];
  return {
    reads,
    read: async (channelIds: readonly string[]) => {
      reads.push(channelIds);
      return new Map(
        channelIds
          .filter((channelId) => channelId !== UNPROVISIONED_CHANNEL)
          .map((channelId) => [channelId, LIVE_THUMBNAIL] as const),
      );
    },
  };
};

describe("statut des lives avec la vignette du live", () => {
  it("ajoute la vignette aux seules chaînes en live dont le flux est provisionné", async () => {
    const thumbnailUrls = makeThumbnailUrls();
    const reader = withThumbnails({
      statuses,
      thumbnailUrls: thumbnailUrls.read,
      onThumbnailFailure: () => {},
    });

    expect(await reader.read([LIVE_CHANNEL, OFFLINE_CHANNEL, UNPROVISIONED_CHANNEL])).toEqual([
      {
        channelId: LIVE_CHANNEL,
        startedAt: STARTED_AT,
        viewerCount: 1,
        thumbnailUrl: LIVE_THUMBNAIL,
      },
      { channelId: OFFLINE_CHANNEL, startedAt: undefined },
      { channelId: UNPROVISIONED_CHANNEL, startedAt: STARTED_AT },
    ]);
    expect(thumbnailUrls.reads).toEqual([[LIVE_CHANNEL, UNPROVISIONED_CHANNEL]]);
  });

  it("ne lit aucune vignette quand aucune chaîne n'est en live", async () => {
    const thumbnailUrls = makeThumbnailUrls();
    const reader = withThumbnails({
      statuses,
      thumbnailUrls: thumbnailUrls.read,
      onThumbnailFailure: () => {},
    });

    expect(await reader.read([OFFLINE_CHANNEL])).toEqual([
      { channelId: OFFLINE_CHANNEL, startedAt: undefined },
    ]);
    expect(thumbnailUrls.reads).toEqual([]);
  });

  it("rend l'état sans vignette quand elles sont illisibles, et signale l'échec", async () => {
    const failures: unknown[] = [];
    const outage = new Error("base injoignable");
    const reader = withThumbnails({
      statuses,
      thumbnailUrls: async () => {
        throw outage;
      },
      onThumbnailFailure: (error) => failures.push(error),
    });

    expect(await reader.read([LIVE_CHANNEL])).toEqual([
      { channelId: LIVE_CHANNEL, startedAt: STARTED_AT, viewerCount: 1 },
    ]);
    expect(failures).toEqual([outage]);
  });
});
