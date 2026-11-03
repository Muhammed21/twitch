import { z } from "zod";

import { extensibleUnion, openEnum, Uuid } from "../conventions/schemas.ts";

const RealtimeChatAuthor = z
  .looseObject({ id: Uuid, displayName: z.string() })
  .meta({ id: "RealtimeChatAuthor" });

export const RealtimeChatMessage = z
  .looseObject({
    id: Uuid,
    channelId: Uuid,
    sessionId: Uuid.optional(),
    author: RealtimeChatAuthor,
    body: z.string(),
    sentAt: z.iso.datetime(),
  })
  .meta({ id: "RealtimeChatMessage" });

export const RealtimeChatRejected = z
  .looseObject({ reason: openEnum(["timed_out", "rate_limited"]) })
  .meta({ id: "RealtimeChatRejected" });

export const RealtimeSessionRevoked = z
  .looseObject({ action: openEnum(["refresh_and_reconnect", "stop"]) })
  .meta({ id: "RealtimeSessionRevoked" });

export const serverEvents = {
  "chat:message": RealtimeChatMessage,
  "chat:rejected": RealtimeChatRejected,
  "session:revoked": RealtimeSessionRevoked,
} as const;

const envelope = <const Event extends keyof typeof serverEvents>(event: Event) =>
  z.looseObject({ event: z.literal(event), data: serverEvents[event] });

export const RealtimeServerMessage = extensibleUnion("event", [
  envelope("chat:message"),
  envelope("chat:rejected"),
  envelope("session:revoked"),
]).meta({ id: "RealtimeServerMessage" });
