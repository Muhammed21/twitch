import { randomUUID } from "node:crypto";

import type { DefaultEventsMap, Server, Socket } from "socket.io";

import type { ChatterContext } from "@repo/authorization";
import { realtime } from "@repo/contracts";

import type { MessageSender } from "../application/message-sender.ts";
import type { RoomRegistry } from "../application/room-registry.ts";
import type { AcceptedMessage } from "../domain/decide.ts";

export type ChatSession = {
  readonly chatter: ChatterContext;
  readonly author: { readonly id: string; readonly displayName: string };
  readonly credentials: { readonly sid: string; readonly token: string };
};

export type ChatIo = Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, ChatSession>;

export type ChatSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, ChatSession>;

type Ack = (response?: unknown) => void;

const { RealtimeChatSend, clientEvents, clientEventSchema } = realtime;

export const SATURATED_ROOM = "saturated";

const roomOf = (channelId: string): string => `room:${channelId}`;

const isAck = (value: unknown): value is Ack => typeof value === "function";

const toRealtimeMessage = (
  { authorId: _authorId, sentAt, ...message }: AcceptedMessage,
  author: ChatSession["author"],
) => ({ id: randomUUID(), ...message, author, sentAt: sentAt.toISOString() });

export const bindChatEvents = ({
  io,
  rooms,
  messages,
  onRejectedEvent,
  onBroadcast,
  onFailure,
}: {
  io: ChatIo;
  rooms: RoomRegistry;
  messages: MessageSender;
  onRejectedEvent: () => void;
  onBroadcast: (deliveries: number) => void;
  onFailure: (error: unknown) => void;
}): void => {
  const recipientsOf = (room: string): number => {
    const members = io.sockets.adapter.rooms.get(room);
    const saturated = [...new Set(io.sockets.adapter.rooms.get(SATURATED_ROOM))];
    return Number(members?.size) - saturated.filter((id) => members?.has(id)).length;
  };

  const bindSocket = (socket: ChatSocket) => {
    const joined = new Set<string>();

    const join = async (payload: unknown) => {
      const parsed = clientEvents["room:join"].safeParse(payload);
      if (!parsed.success) {
        onRejectedEvent();
        return;
      }
      const { channelId } = parsed.data;
      if (joined.has(channelId) || (await rooms.enter(channelId)) === undefined) {
        return;
      }
      if (socket.disconnected) {
        rooms.leave(channelId);
        return;
      }
      joined.add(channelId);
      await socket.join(roomOf(channelId));
    };

    const leave = async (payload: unknown) => {
      const parsed = clientEvents["room:leave"].safeParse(payload);
      if (!parsed.success) {
        onRejectedEvent();
        return;
      }
      const { channelId } = parsed.data;
      if (!joined.delete(channelId)) {
        return;
      }
      await socket.leave(roomOf(channelId));
      rooms.leave(channelId);
    };

    const send = (payload: unknown, ack: unknown) => {
      const parsed = RealtimeChatSend.safeParse(payload);
      if (!parsed.success || !isAck(ack)) {
        onRejectedEvent();
        return;
      }
      const { channelId, body } = parsed.data;
      const room = joined.has(channelId) ? rooms.state(channelId) : undefined;
      if (room === undefined) {
        ack({ reason: "not_joined" });
        return;
      }
      const sent = messages.send({ chatter: socket.data.chatter, room, body, now: new Date() });
      if (!sent.ok) {
        ack({ reason: sent.error });
        return;
      }
      io.to(roomOf(channelId))
        .except(SATURATED_ROOM)
        .emit("chat:message", toRealtimeMessage(sent.value, socket.data.author));
      onBroadcast(recipientsOf(roomOf(channelId)));
      ack();
    };

    const queue = { tail: Promise.resolve() };
    const inTurn = (task: () => Promise<void> | void) => {
      queue.tail = queue.tail.then(task).catch(onFailure);
    };
    socket.onAny((event: string) => {
      if (clientEventSchema(event) === undefined) {
        onRejectedEvent();
      }
    });
    socket.on("room:join", (payload: unknown) => inTurn(() => join(payload)));
    socket.on("room:leave", (payload: unknown) => inTurn(() => leave(payload)));
    socket.on("chat:send", (payload: unknown, ack: unknown) => inTurn(() => send(payload, ack)));
    socket.on("disconnect", () => {
      joined.forEach((channelId) => rooms.leave(channelId));
      joined.clear();
    });
  };

  io.on("connection", bindSocket);
};
