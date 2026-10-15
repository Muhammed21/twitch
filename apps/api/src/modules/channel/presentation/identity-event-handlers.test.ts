import { describe, expect, it } from "vitest";

import type { StreamEvent } from "../../../platform/stream-entry.ts";
import type {
  AccountRegistration,
  ChannelCreation,
} from "../application/create-channel-for-account.ts";
import { identityEventHandlers } from "./identity-event-handlers.ts";

const ACCOUNT_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const EVENT_ID = "0e1d2c3b-4a59-4687-9a1b-2c3d4e5f6a7b";

const makeEvent = (payload: unknown = { accountId: ACCOUNT_ID, displayName: "Streamer" }) => ({
  id: EVENT_ID,
  name: "identity.account.registered",
  version: 1,
  occurredAt: new Date("2026-10-15T10:00:00.000Z"),
  payload,
});

const setup = (createChannel: (registration: AccountRegistration) => Promise<ChannelCreation>) => {
  const lines: unknown[] = [];
  const handlers = identityEventHandlers({
    createChannel,
    logSink: (line) => lines.push(JSON.parse(line)),
  });
  const handle = (event: StreamEvent) => {
    const handler = handlers["identity.account.registered"];
    if (handler === undefined) {
      throw new Error("handler identity.account.registered absent");
    }
    return handler(event);
  };
  return { handlers, lines, handle };
};

const answering = (outcome: ChannelCreation) => {
  const requests: AccountRegistration[] = [];
  const createChannel = async (registration: AccountRegistration) => {
    requests.push(registration);
    return outcome;
  };
  return { requests, createChannel };
};

const CREATED: ChannelCreation = { status: "created", slug: "streamer", cacheInvalidated: true };

describe("handlers de channel pour events.identity", () => {
  it("ne traite que identity.account.registered", () => {
    expect(Object.keys(setup(answering(CREATED).createChannel).handlers)).toEqual([
      "identity.account.registered",
    ]);
  });

  it("crée la chaîne du compte inscrit, sans rien journaliser", async () => {
    const { requests, createChannel } = answering(CREATED);
    const { lines, handle } = setup(createChannel);

    await handle(makeEvent());

    expect(requests).toEqual([
      { eventId: EVENT_ID, accountId: ACCOUNT_ID, displayName: "Streamer" },
    ]);
    expect(lines).toEqual([]);
  });

  it("écarte sans échouer un payload hors contrat, et le journalise", async () => {
    const { requests, createChannel } = answering(CREATED);
    const { lines, handle } = setup(createChannel);

    await handle(makeEvent({ accountId: ACCOUNT_ID }));

    expect(requests).toEqual([]);
    expect(lines).toEqual([
      expect.objectContaining({
        level: "error",
        msg: "event écarté : payload hors contrat",
        event: "identity.account.registered",
        eventId: EVENT_ID,
      }),
    ]);
  });

  it("journalise une chaîne créée dont les attributions n'ont pas été invalidées", async () => {
    const { lines, handle } = setup(
      answering({ status: "created", slug: "streamer", cacheInvalidated: false }).createChannel,
    );

    await handle(makeEvent());

    expect(lines).toEqual([
      expect.objectContaining({
        level: "error",
        msg: "attributions du propriétaire non invalidées",
        eventId: EVENT_ID,
      }),
    ]);
  });

  it("ne journalise rien pour un event déjà traité", async () => {
    const { lines, handle } = setup(answering({ status: "already-processed" }).createChannel);

    await handle(makeEvent());

    expect(lines).toEqual([]);
  });

  it("laisse remonter l'échec de la création, pour que l'event reste en attente", async () => {
    const failure = new Error("base indisponible");
    const { handle } = setup(() => Promise.reject(failure));

    await expect(handle(makeEvent())).rejects.toBe(failure);
  });
});
