import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { events } from "@repo/contracts";

import type { RoomState } from "../domain/decide.ts";
import type { LiveSession, LocalViewWriter } from "./ports.ts";
import { chatEventHandlers } from "./project-event.ts";
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
  };
  return { views, writes };
};

const setup = (rooms: readonly RoomState[] = []) => {
  const { views, writes } = makeViews();
  const registry = createRoomRegistry({
    find: async (channelId) => rooms.find((room) => room.channelId === channelId),
  });
  const logs: Readonly<Record<string, unknown>>[] = [];
  const handlers = chatEventHandlers({
    views,
    rooms: registry,
    log: (entry) => {
      logs.push(entry);
    },
  });
  const handle = (event: { name: string; version: number; payload: unknown }) => {
    const handler = handlers[event.name];
    if (handler === undefined) {
      throw new Error(`aucun handler pour ${event.name}`);
    }
    return handler(event);
  };
  return { handlers, handle, writes, registry, logs };
};

const { channelCreated } = events.channel;
const { streamStarted, streamEnded } = events.stream;
const { accountRegistered } = events.identity;

describe("projection des events dans les vues locales du chat", () => {
  it("traite channel.created, stream.started, stream.ended et identity.account.registered", () => {
    expect(Object.keys(setup().handlers).toSorted()).toEqual([
      "channel.created",
      "identity.account.registered",
      "stream.ended",
      "stream.started",
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
