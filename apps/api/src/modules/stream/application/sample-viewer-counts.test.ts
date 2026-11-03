import { describe, expect, it } from "vitest";

import type { PresenceStore } from "./presence.ts";
import {
  nextSampleDelayMs,
  type OpenSessionPages,
  sampleViewerCounts,
  type ViewerCountSample,
} from "./sample-viewer-counts.ts";

const WINDOW_START = new Date("2026-11-03T20:00:30.000Z");
const NOW = new Date("2026-11-03T20:00:47.250Z");

const makeSession = (index: number) => ({
  sessionId: `00000000-0000-4000-8000-00000000000${index}`,
  channelId: `00000000-0000-4000-9000-00000000000${index}`,
});

const makeOpenSessionPages = (
  pages: readonly (readonly ReturnType<typeof makeSession>[])[],
): OpenSessionPages => ({
  forEachPage: async (visit) => {
    await pages.reduce((previous, page) => previous.then(() => visit(page)), Promise.resolve());
  },
});

const makePresence = (counts: ReadonlyMap<string, number>) => {
  const reads: { channelIds: readonly string[]; at: Date }[] = [];
  const presence: PresenceStore = {
    record: async () => {},
    count: async (request) => {
      reads.push(request);
      return new Map(
        request.channelIds.map((channelId) => [channelId, counts.get(channelId) ?? 0]),
      );
    },
  };
  return { presence, reads };
};

const makeSamples = () => {
  const writes: (readonly ViewerCountSample[])[] = [];
  return {
    writes,
    samples: {
      record: async (page: readonly ViewerCountSample[]) => {
        writes.push(page);
      },
    },
  };
};

describe("échantillon du compteur de viewers (ADR 0004 §3)", () => {
  it("donne à chaque session ouverte le compteur de l'instant, daté du début de sa fenêtre de 30 s, zéro compris", async () => {
    const watched = makeSession(1);
    const empty = makeSession(2);
    const { presence } = makePresence(new Map([[watched.channelId, 12]]));
    const { samples, writes } = makeSamples();

    await sampleViewerCounts({
      sessions: makeOpenSessionPages([[watched, empty]]),
      presence,
      samples,
    })(NOW);

    expect(writes.flat()).toEqual([
      { sessionId: watched.sessionId, sampledAt: WINDOW_START, viewerCount: 12 },
      { sessionId: empty.sessionId, sampledAt: WINDOW_START, viewerCount: 0 },
    ]);
  });

  it("lit les compteurs une fois et écrit une fois par page de sessions, au même instant", async () => {
    const first = [makeSession(1), makeSession(2)];
    const second = [makeSession(3)];
    const { presence, reads } = makePresence(new Map());
    const { samples, writes } = makeSamples();

    await sampleViewerCounts({
      sessions: makeOpenSessionPages([first, second]),
      presence,
      samples,
    })(NOW);

    expect(reads).toEqual([
      { channelIds: first.map(({ channelId }) => channelId), at: NOW },
      { channelIds: second.map(({ channelId }) => channelId), at: NOW },
    ]);
    expect(writes.map((page) => page.map(({ sessionId }) => sessionId))).toEqual([
      first.map(({ sessionId }) => sessionId),
      second.map(({ sessionId }) => sessionId),
    ]);
  });

  it.each([
    ["au milieu d'une fenêtre", 17_250, 13_750],
    ["au tout début d'une fenêtre", 0, 31_000],
    ["à la dernière milliseconde d'une fenêtre", 29_999, 1001],
  ])(
    "attend %s le début de la fenêtre suivante, plus une seconde",
    (_, intoWindowMs, expectedDelayMs) => {
      expect(nextSampleDelayMs(new Date(WINDOW_START.getTime() + intoWindowMs))).toBe(
        expectedDelayMs,
      );
    },
  );
});
