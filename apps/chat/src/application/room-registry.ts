import type { RoomState } from "../domain/decide.ts";
import type { RoomDirectory } from "./ports.ts";

type LoadedRoom = { readonly loading: Promise<RoomState | undefined>; readonly members: number };

export type RoomRegistry = ReturnType<typeof createRoomRegistry>;

export const createRoomRegistry = (directory: RoomDirectory) => {
  const loaded = new Map<string, LoadedRoom>();
  const states = new Map<string, RoomState>();

  const leave = (channelId: string): void => {
    const room = loaded.get(channelId);
    if (room === undefined) {
      return;
    }
    if (room.members === 1) {
      loaded.delete(channelId);
      states.delete(channelId);
      return;
    }
    loaded.set(channelId, { ...room, members: room.members - 1 });
  };

  const enter = async (channelId: string): Promise<RoomState | undefined> => {
    const room = loaded.get(channelId) ?? { loading: directory.find(channelId), members: 0 };
    loaded.set(channelId, { ...room, members: room.members + 1 });
    const stillCounted = () => loaded.get(channelId)?.loading === room.loading;
    const state = await room.loading.catch((error: unknown) => {
      if (stillCounted()) {
        leave(channelId);
      }
      throw error;
    });
    if (!stillCounted()) {
      return undefined;
    }
    if (state === undefined) {
      leave(channelId);
      return undefined;
    }
    states.set(channelId, state);
    return state;
  };

  return {
    enter,
    leave,
    state: (channelId: string): RoomState | undefined => states.get(channelId),
    loadedCount: (): number => loaded.size,
  };
};
