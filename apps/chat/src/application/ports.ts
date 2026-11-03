import type { RoomState } from "../domain/decide.ts";

export type RoomDirectory = { find(channelId: string): Promise<RoomState | undefined> };

export type ChatterProfiles = { displayNameOf(userId: string): Promise<string | null> };

export type LiveSession = { readonly channelId: string; readonly sessionId: string };

export type LocalViewWriter = {
  openRoom(channelId: string): Promise<void>;
  startSession(session: LiveSession): Promise<RoomState>;
  endSession(session: LiveSession): Promise<RoomState>;
  registerChatter(chatter: {
    readonly userId: string;
    readonly displayName: string;
  }): Promise<void>;
};
