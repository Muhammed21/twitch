import { describe, expect, it, vi } from "vitest";

import type { RoomState } from "../domain/decide.ts";
import type { RoomDirectory } from "./ports.ts";
import { createRoomRegistry } from "./room-registry.ts";

const CHANNEL_ID = "channel-a";
const UNKNOWN_CHANNEL_ID = "channel-inconnue";

const OFFLINE_ROOM: RoomState = { channelId: CHANNEL_ID, sessionId: null };

const makeDirectory = (rooms: readonly RoomState[] = [OFFLINE_ROOM]) => {
  const find = vi.fn<RoomDirectory["find"]>(async (channelId) =>
    rooms.find((room) => room.channelId === channelId),
  );
  return { find };
};

describe("registre des salons chargés", () => {
  it("charge l'état d'un salon à la première entrée, et une seule fois pour des entrées simultanées", async () => {
    const directory = makeDirectory();
    const registry = createRoomRegistry(directory);

    const states = await Promise.all([registry.enter(CHANNEL_ID), registry.enter(CHANNEL_ID)]);

    expect(states).toEqual([OFFLINE_ROOM, OFFLINE_ROOM]);
    expect(registry.state(CHANNEL_ID)).toEqual(OFFLINE_ROOM);
    expect(directory.find).toHaveBeenCalledTimes(1);
    expect(registry.loadedCount()).toBe(1);
  });

  it("garde le salon tant qu'il reste un connecté, et le libère après le dernier", async () => {
    const registry = createRoomRegistry(makeDirectory());
    await registry.enter(CHANNEL_ID);
    await registry.enter(CHANNEL_ID);

    registry.leave(CHANNEL_ID);

    expect(registry.state(CHANNEL_ID)).toEqual(OFFLINE_ROOM);
    registry.leave(CHANNEL_ID);
    expect(registry.state(CHANNEL_ID)).toBeUndefined();
    expect(registry.loadedCount()).toBe(0);
  });

  it("relit l'état d'un salon libéré à l'entrée suivante", async () => {
    const directory = makeDirectory();
    const registry = createRoomRegistry(directory);
    await registry.enter(CHANNEL_ID);
    registry.leave(CHANNEL_ID);

    await registry.enter(CHANNEL_ID);

    expect(directory.find).toHaveBeenCalledTimes(2);
  });

  it("ne charge pas le salon d'une chaîne inconnue", async () => {
    const registry = createRoomRegistry(makeDirectory());

    expect(await registry.enter(UNKNOWN_CHANNEL_ID)).toBeUndefined();
    expect(registry.loadedCount()).toBe(0);
  });

  it("ne garde aucun salon quand la lecture de son état échoue", async () => {
    const registry = createRoomRegistry({
      find: async () => {
        throw new Error("Redis injoignable");
      },
    });

    await expect(registry.enter(CHANNEL_ID)).rejects.toThrow("Redis injoignable");
    expect(registry.loadedCount()).toBe(0);
  });

  it("ignore la sortie d'un salon qui n'est pas chargé", () => {
    const registry = createRoomRegistry(makeDirectory());

    registry.leave(CHANNEL_ID);

    expect(registry.loadedCount()).toBe(0);
  });
});
