import { describe, expect, it } from "vitest";

import {
  type DanglingLive,
  type DanglingLiveEnding,
  endDanglingLives,
} from "./end-dangling-lives.ts";

const NOW = new Date("2026-11-06T08:00:00.000Z");

const makeDanglingLive = (overrides: Partial<DanglingLive> = {}): DanglingLive => ({
  sessionId: "session-1",
  channelId: "channel-1",
  startedAt: new Date("2026-11-04T11:23:36.513Z"),
  ...overrides,
});

const setup = (dangling: readonly DanglingLive[]) => {
  const ended: DanglingLiveEnding[] = [];
  const ids = ["event-1", "event-2", "event-3"];
  const end = endDanglingLives({
    lives: {
      list: async () => dangling,
      end: async (ending) => {
        ended.push(ending);
      },
    },
    now: () => NOW,
    newId: () => ids.shift() ?? "event-en-trop",
  });
  return { ended, end };
};

describe("fin des lives restés ouverts sur une pile de développement", () => {
  it("termine chaque live resté ouvert, maintenant, par un stream.ended qui lui est propre", async () => {
    const first = makeDanglingLive({ sessionId: "session-1", channelId: "channel-1" });
    const second = makeDanglingLive({ sessionId: "session-2", channelId: "channel-2" });
    const { ended, end } = setup([first, second]);

    expect(await end()).toEqual([first, second]);
    expect(ended).toEqual([
      { live: first, endedAt: NOW, outboxEventId: "event-1" },
      { live: second, endedAt: NOW, outboxEventId: "event-2" },
    ]);
  });

  it("ne termine jamais un live avant son début, même daté dans le futur par un test", async () => {
    const future = makeDanglingLive({ startedAt: new Date("2099-01-01T00:00:00.000Z") });
    const { ended, end } = setup([future]);

    await end();

    expect(ended).toEqual([{ live: future, endedAt: future.startedAt, outboxEventId: "event-1" }]);
  });

  it("ne publie rien quand aucun live n'est resté ouvert", async () => {
    const { ended, end } = setup([]);

    expect(await end()).toEqual([]);
    expect(ended).toEqual([]);
  });
});
