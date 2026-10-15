import { describe, expect, it } from "vitest";

import type { StreamEvent } from "../../../platform/stream-entry.ts";
import { channelEventHandlers } from "./channel-event-handlers.ts";

const CHANNEL_ID = "9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69";
const OWNER_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const EVENT_ID = "0e1d2c3b-4a59-4687-9a1b-2c3d4e5f6a7b";

const makeEvent = (
  payload: unknown = { channelId: CHANNEL_ID, ownerId: OWNER_ID, slug: "streamer" },
  version = 1,
): StreamEvent => ({
  id: EVENT_ID,
  name: "channel.created",
  version,
  occurredAt: new Date("2026-10-15T10:00:00.000Z"),
  payload,
});

const setup = (provision: (input: { channelId: string }) => Promise<void> = async () => {}) => {
  const provisioned: string[] = [];
  const lines: unknown[] = [];
  const handlers = channelEventHandlers({
    provision: async (input) => {
      provisioned.push(input.channelId);
      await provision(input);
    },
    logSink: (line) => lines.push(JSON.parse(line)),
  });
  const handle = (event: StreamEvent) => {
    const handler = handlers["channel.created"];
    if (handler === undefined) {
      throw new Error("handler channel.created absent");
    }
    return handler(event);
  };
  return { handlers, provisioned, lines, handle };
};

describe("handlers de stream pour events.channel", () => {
  it("ne traite que channel.created", () => {
    expect(Object.keys(setup().handlers)).toEqual(["channel.created"]);
  });

  it("provisionne le canal provider de la chaîne créée, sans rien journaliser", async () => {
    const { provisioned, lines, handle } = setup();

    await handle(makeEvent());

    expect(provisioned).toEqual([CHANNEL_ID]);
    expect(lines).toEqual([]);
  });

  it("laisse en attente une version qu'il ne gère pas", async () => {
    const { provisioned, handle } = setup();

    await expect(handle(makeEvent(undefined, 2))).rejects.toThrow(
      new Error("channel.created version 2 non gérée"),
    );
    expect(provisioned).toEqual([]);
  });

  it("écarte sans échouer un payload hors contrat, et le journalise", async () => {
    const { provisioned, lines, handle } = setup();

    await handle(makeEvent({ channelId: "pas-un-uuid" }));

    expect(provisioned).toEqual([]);
    expect(lines).toEqual([
      expect.objectContaining({
        level: "error",
        msg: "event écarté : payload hors contrat",
        event: "channel.created",
        eventId: EVENT_ID,
      }),
    ]);
  });

  it("laisse remonter l'échec du provisionnement, pour que l'event reste en attente", async () => {
    const failure = new Error("provider indisponible");
    const { handle } = setup(() => Promise.reject(failure));

    await expect(handle(makeEvent())).rejects.toBe(failure);
  });
});
