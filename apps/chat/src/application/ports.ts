import type { ChatSanction } from "@repo/authorization";

import type { RoomState } from "../domain/decide.ts";

export type RoomDirectory = { find(channelId: string): Promise<RoomState | undefined> };

export type ChatterProfiles = {
  displayNameOf(userId: string): Promise<string | null>;
  sanctionsOf(userId: string): Promise<readonly ChatSanction[]>;
};

export type ChatterSanction = {
  readonly userId: string;
  readonly channelId: string;
  readonly expiresAt: Date;
};

export type SanctionedSockets = { sanction(sanction: ChatterSanction): void };

export type SanctionMetrics = { sanctionApplied(sanctionedAt: Date): void };

export type TokenRequest = { readonly userId: string; readonly now: Date };

export type RateLimit = { take(request: TokenRequest): Promise<boolean> };

export type LiveSession = { readonly channelId: string; readonly sessionId: string };

export type LocalViewWriter = {
  openRoom(channelId: string): Promise<void>;
  startSession(session: LiveSession): Promise<RoomState>;
  endSession(session: LiveSession): Promise<RoomState>;
  registerChatter(chatter: {
    readonly userId: string;
    readonly displayName: string;
  }): Promise<void>;
  sanctionChatter(sanction: ChatterSanction): Promise<void>;
};
