import { describe, expect, it } from "vitest";

import { type ChatterContext, chatterContextFor } from "@repo/authorization";
import { err } from "@repo/result";

import type { RoomState } from "../domain/decide.ts";
import { createMessageSender } from "./message-sender.ts";

const NOW = new Date("2026-11-03T20:00:00.000Z");
const ROOM: RoomState = { channelId: "channel-a", sessionId: null };

const secondsFromNow = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

const makeChatter = (userId = "user-1"): ChatterContext =>
  chatterContextFor({ userId, assignments: [], now: NOW });

const sendBurst = (
  sender: ReturnType<typeof createMessageSender>,
  { chatter, count }: { chatter: ChatterContext; count: number },
) =>
  Array.from({ length: count }, () =>
    sender.send({ chatter, room: ROOM, body: "salut", now: NOW }),
  );

describe("envoi d'un message", () => {
  it("accepte un message au nom du chatter, dans le salon donné", () => {
    const sender = createMessageSender();

    expect(sender.send({ chatter: makeChatter(), room: ROOM, body: "salut", now: NOW })).toEqual({
      ok: true,
      value: { channelId: ROOM.channelId, authorId: "user-1", body: "salut", sentAt: NOW },
    });
  });

  it("retient le seau du chatter d'un message à l'autre : le sixième de la rafale est refusé", () => {
    const sender = createMessageSender();

    const decisions = sendBurst(sender, { chatter: makeChatter(), count: 6 });

    expect(decisions.map((decision) => decision.ok)).toEqual([true, true, true, true, true, false]);
    expect(decisions[5]).toEqual(err("rate_limited"));
  });

  it("tient un seau par chatter", () => {
    const sender = createMessageSender();
    sendBurst(sender, { chatter: makeChatter("user-1"), count: 5 });

    expect(sendBurst(sender, { chatter: makeChatter("user-2"), count: 1 })[0]?.ok).toBe(true);
  });

  it("oublie les seaux redevenus pleins et garde les seaux entamés", () => {
    const sender = createMessageSender();
    sendBurst(sender, { chatter: makeChatter("user-1"), count: 1 });
    sender.send({
      chatter: makeChatter("user-2"),
      room: ROOM,
      body: "salut",
      now: secondsFromNow(1),
    });

    sender.sweep(secondsFromNow(1.5));

    expect(sender.bucketCount()).toBe(1);
    expect(
      sendBurst(sender, { chatter: makeChatter("user-1"), count: 5 }).every(({ ok }) => ok),
    ).toBe(true);
  });
});
