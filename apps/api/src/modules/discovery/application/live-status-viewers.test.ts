import { describe, expect, it } from "vitest";

import type { ChannelLiveStatus, LiveStatusReader } from "./live-status-hub.ts";
import { withViewerCounts } from "./live-status-viewers.ts";

const LIVE_CHANNEL = "00000000-0000-4000-8000-000000000001";
const OTHER_LIVE_CHANNEL = "00000000-0000-4000-8000-000000000002";
const OFFLINE_CHANNEL = "00000000-0000-4000-8000-000000000003";
const SILENT_CHANNEL = "00000000-0000-4000-8000-000000000004";

const STARTED_AT = new Date("2026-11-03T20:00:00.000Z");

const PROJECTION: readonly ChannelLiveStatus[] = [
  { channelId: LIVE_CHANNEL, startedAt: STARTED_AT },
  { channelId: OTHER_LIVE_CHANNEL, startedAt: STARTED_AT },
  { channelId: OFFLINE_CHANNEL, startedAt: undefined },
  { channelId: SILENT_CHANNEL, startedAt: STARTED_AT },
];

const statuses: LiveStatusReader = {
  read: async (channelIds) => PROJECTION.filter(({ channelId }) => channelIds.includes(channelId)),
};

const makeViewerCounts = (counts: ReadonlyMap<string, number>) => {
  const reads: (readonly string[])[] = [];
  return {
    reads,
    read: async (channelIds: readonly string[]) => {
      reads.push(channelIds);
      return new Map(
        channelIds.flatMap((channelId) => {
          const count = counts.get(channelId);
          return count === undefined ? [] : [[channelId, count] as const];
        }),
      );
    },
  };
};

describe("statut des lives avec le nombre de viewers (ADR 0004 §3)", () => {
  it("ajoute à chaque chaîne en live son nombre de viewers, et rien à une chaîne hors live", async () => {
    const viewerCounts = makeViewerCounts(
      new Map([
        [LIVE_CHANNEL, 3],
        [OTHER_LIVE_CHANNEL, 7],
        [OFFLINE_CHANNEL, 2],
      ]),
    );
    const reader = withViewerCounts({
      statuses,
      viewerCounts: viewerCounts.read,
      onViewerCountFailure: () => {},
    });

    expect(
      await reader.read([LIVE_CHANNEL, OTHER_LIVE_CHANNEL, OFFLINE_CHANNEL, SILENT_CHANNEL]),
    ).toEqual([
      { channelId: LIVE_CHANNEL, startedAt: STARTED_AT, viewerCount: 3 },
      { channelId: OTHER_LIVE_CHANNEL, startedAt: STARTED_AT, viewerCount: 7 },
      { channelId: OFFLINE_CHANNEL, startedAt: undefined },
      { channelId: SILENT_CHANNEL, startedAt: STARTED_AT, viewerCount: 0 },
    ]);
  });

  it("lit les compteurs des seules chaînes en live, en une lecture", async () => {
    const viewerCounts = makeViewerCounts(new Map());
    const reader = withViewerCounts({
      statuses,
      viewerCounts: viewerCounts.read,
      onViewerCountFailure: () => {},
    });

    await reader.read([LIVE_CHANNEL, OFFLINE_CHANNEL, SILENT_CHANNEL]);

    expect(viewerCounts.reads).toEqual([[LIVE_CHANNEL, SILENT_CHANNEL]]);
  });

  it("rend l'état des lives sans nombre de viewers quand les compteurs sont illisibles, et signale l'échec", async () => {
    const failures: unknown[] = [];
    const outage = new Error("Redis présence injoignable");
    const reader = withViewerCounts({
      statuses,
      viewerCounts: async () => {
        throw outage;
      },
      onViewerCountFailure: (error) => failures.push(error),
    });

    expect(await reader.read([LIVE_CHANNEL, OFFLINE_CHANNEL])).toEqual([
      { channelId: LIVE_CHANNEL, startedAt: STARTED_AT },
      { channelId: OFFLINE_CHANNEL, startedAt: undefined },
    ]);
    expect(failures).toEqual([outage]);
  });
});
