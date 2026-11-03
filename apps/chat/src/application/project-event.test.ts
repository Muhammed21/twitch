import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { events } from "@repo/contracts";

import type { RoomState } from "../domain/decide.ts";
import type { LiveSession, LocalViewWriter } from "./ports.ts";
import {
  type ChatEventHandler,
  chatEventHandlers,
  socketSanctionHandlers,
} from "./project-event.ts";
import { createRoomRegistry } from "./room-registry.ts";

const makeViews = () => {
  const writes: unknown[] = [];
  const views: LocalViewWriter = {
    openRoom: async (channelId) => {
      writes.push({ openRoom: channelId });
    },
    startSession: async (session: LiveSession) => {
      writes.push({ startSession: session });
      return session;
    },
    endSession: async (session: LiveSession) => {
      writes.push({ endSession: session });
      return { channelId: session.channelId, sessionId: null };
    },
    registerChatter: async (chatter) => {
      writes.push({ registerChatter: chatter });
    },
    sanctionChatter: async (sanction) => {
      writes.push({ sanctionChatter: sanction });
    },
  };
  return { views, writes };
};

const setup = (rooms: readonly RoomState[] = []) => {
  const { views, writes } = makeViews();
  const registry = createRoomRegistry({
    find: async (channelId) => rooms.find((room) => room.channelId === channelId),
  });
  const logs: Readonly<Record<string, unknown>>[] = [];
  const applied: unknown[] = [];
  const sanctionedAt: Date[] = [];
  const log = (entry: Readonly<Record<string, unknown>>) => {
    logs.push(entry);
  };
  const handlers = chatEventHandlers({ views, rooms: registry, log });
  const socketHandlers = socketSanctionHandlers({
    sockets: {
      sanction: (sanction) => {
        applied.push(sanction);
      },
    },
    metrics: {
      sanctionApplied: (instant) => {
        sanctionedAt.push(instant);
      },
    },
    log,
  });
  const dispatch =
    (table: Readonly<Record<string, ChatEventHandler>>) =>
    ({
      occurredAt = new Date(),
      ...event
    }: {
      name: string;
      version: number;
      payload: unknown;
      occurredAt?: Date;
    }) => {
      const handler = table[event.name];
      if (handler === undefined) {
        throw new Error(`aucun handler pour ${event.name}`);
      }
      return handler({ ...event, occurredAt });
    };
  return {
    handlers,
    socketHandlers,
    handle: dispatch(handlers),
    applyToSockets: dispatch(socketHandlers),
    writes,
    applied,
    sanctionedAt,
    registry,
    logs,
  };
};

const { channelCreated } = events.channel;
const { streamStarted, streamEnded } = events.stream;
const { accountRegistered } = events.identity;
const { userTimedOut } = events.moderation;

describe("projection des events dans les vues locales du chat", () => {
  it("traite les events de chaîne, de live, de compte et de timeout", () => {
    expect(Object.keys(setup().handlers).toSorted()).toEqual([
      "channel.created",
      "identity.account.registered",
      "moderation.user.timed_out",
      "stream.ended",
      "stream.started",
    ]);
  });

  it("enregistre le timeout d'un chatter dans la vue locale, sans toucher aux sockets", async () => {
    const { handle, writes, applied, sanctionedAt } = setup();
    const sanction = {
      userId: randomUUID(),
      channelId: randomUUID(),
      expiresAt: new Date("2026-11-03T20:10:00.000Z"),
    };

    await handle({
      name: userTimedOut.name,
      version: 1,
      payload: { ...sanction, expiresAt: sanction.expiresAt.toISOString() },
    });

    expect(writes).toEqual([{ sanctionChatter: sanction }]);
    expect(applied).toEqual([]);
    expect(sanctionedAt).toEqual([]);
  });

  it("applique aux sockets ouvertes un timeout lu par l'instance, puis mesure son délai", async () => {
    const { socketHandlers, applyToSockets, writes, applied, sanctionedAt } = setup();
    const occurredAt = new Date("2026-11-03T20:00:00.000Z");
    const sanction = {
      userId: randomUUID(),
      channelId: randomUUID(),
      expiresAt: new Date("2026-11-03T20:10:00.000Z"),
    };

    await applyToSockets({
      name: userTimedOut.name,
      version: 1,
      occurredAt,
      payload: { ...sanction, expiresAt: sanction.expiresAt.toISOString() },
    });

    expect(Object.keys(socketHandlers)).toEqual(["moderation.user.timed_out"]);
    expect(applied).toEqual([sanction]);
    expect(sanctionedAt).toEqual([occurredAt]);
    expect(writes).toEqual([]);
  });

  it("écarte un timeout hors contrat sans toucher aux sockets", async () => {
    const { applyToSockets, applied, logs } = setup();

    await applyToSockets({ name: userTimedOut.name, version: 1, payload: { userId: 1 } });

    expect(applied).toEqual([]);
    expect(logs).toEqual([
      { level: "error", msg: "event écarté : payload hors contrat", event: userTimedOut.name },
    ]);
  });

  it("ouvre le salon d'une chaîne créée", async () => {
    const { handle, writes } = setup();
    const channelId = randomUUID();

    await handle({
      name: channelCreated.name,
      version: 1,
      payload: { channelId, ownerId: randomUUID(), slug: "alice" },
    });

    expect(writes).toEqual([{ openRoom: channelId }]);
  });

  it("enregistre le nom affiché d'un compte créé", async () => {
    const { handle, writes } = setup();
    const accountId = randomUUID();

    await handle({
      name: accountRegistered.name,
      version: 1,
      payload: { accountId, displayName: "Alice" },
    });

    expect(writes).toEqual([{ registerChatter: { userId: accountId, displayName: "Alice" } }]);
  });

  it("rattache à la session du live le salon chargé d'une chaîne qui démarre un live", async () => {
    const room: RoomState = { channelId: randomUUID(), sessionId: null };
    const { handle, writes, registry } = setup([room]);
    await registry.enter(room.channelId);
    const sessionId = randomUUID();

    await handle({
      name: streamStarted.name,
      version: 1,
      payload: { sessionId, channelId: room.channelId, startedAt: "2026-11-03T20:00:00.000Z" },
    });

    expect(writes).toEqual([{ startSession: { channelId: room.channelId, sessionId } }]);
    expect(registry.state(room.channelId)).toEqual({ channelId: room.channelId, sessionId });
  });

  it("détache de la session le salon chargé d'une chaîne dont le live se termine", async () => {
    const sessionId = randomUUID();
    const room: RoomState = { channelId: randomUUID(), sessionId };
    const { handle, writes, registry } = setup([room]);
    await registry.enter(room.channelId);

    await handle({
      name: streamEnded.name,
      version: 1,
      payload: { sessionId, channelId: room.channelId, endedAt: "2026-11-03T22:00:00.000Z" },
    });

    expect(writes).toEqual([{ endSession: { channelId: room.channelId, sessionId } }]);
    expect(registry.state(room.channelId)).toEqual({ channelId: room.channelId, sessionId: null });
  });

  it("écarte en le journalisant un payload hors contrat, sans rien écrire", async () => {
    const { handle, writes, logs } = setup();

    await handle({ name: channelCreated.name, version: 1, payload: { channelId: "pas-un-uuid" } });

    expect(writes).toEqual([]);
    expect(logs).toEqual([
      { level: "error", msg: "event écarté : payload hors contrat", event: "channel.created" },
    ]);
  });

  it("échoue sur une version non gérée, pour que l'event reste à traiter", async () => {
    const { handle, writes } = setup();

    await expect(handle({ name: accountRegistered.name, version: 2, payload: {} })).rejects.toThrow(
      "identity.account.registered version 2 non gérée",
    );
    expect(writes).toEqual([]);
  });
});
