import { z } from "zod";

import { Uuid } from "../conventions/schemas.ts";

const MESSAGE_BODY_MAX_LENGTH = 500;

export const RealtimeChatSend = z
  .strictObject({ channelId: Uuid, body: z.string().min(1).max(MESSAGE_BODY_MAX_LENGTH) })
  .meta({ id: "RealtimeChatSend" });

const RealtimeRoomJoin = z.strictObject({ channelId: Uuid }).meta({ id: "RealtimeRoomJoin" });

const RealtimeRoomLeave = z.strictObject({ channelId: Uuid }).meta({ id: "RealtimeRoomLeave" });

export const clientEvents = {
  "chat:send": RealtimeChatSend,
  "room:join": RealtimeRoomJoin,
  "room:leave": RealtimeRoomLeave,
} as const;

export type ClientEvent = keyof typeof clientEvents;

const isClientEvent = (event: string): event is ClientEvent => Object.hasOwn(clientEvents, event);

export const clientEventSchema = (event: string): z.ZodType | undefined =>
  isClientEvent(event) ? clientEvents[event] : undefined;
