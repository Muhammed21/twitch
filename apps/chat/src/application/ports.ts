import type { RoomState } from "../domain/decide.ts";

export type RoomDirectory = { find(channelId: string): Promise<RoomState | undefined> };

export type ChatterProfiles = { displayNameOf(userId: string): Promise<string | null> };
