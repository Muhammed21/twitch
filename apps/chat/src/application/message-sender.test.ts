import { describe, expect, it } from "vitest";

import { type ChatterContext, chatterContextFor, type RoleAssignment } from "@repo/authorization";
import { err, ok } from "@repo/result";

import type { RoomState } from "../domain/decide.ts";
import { createMessageSender } from "./message-sender.ts";
import type { RateLimit, TokenRequest } from "./ports.ts";

const NOW = new Date("2026-11-03T20:00:00.000Z");
const ROOM: RoomState = { channelId: "channel-a", sessionId: null };

const makeChatter = (...assignments: readonly RoleAssignment[]): ChatterContext =>
  chatterContextFor({ userId: "user-1", assignments, now: NOW });

const TIMED_OUT_HERE: RoleAssignment = {
  role: "banned",
  scope: { type: "channel", channelId: ROOM.channelId },
  expiresAt: new Date(NOW.getTime() + 60_000),
  revokedAt: null,
};

const makeRateLimit = (admits: boolean) => {
  const requests: TokenRequest[] = [];
  const limit: RateLimit = {
    take: async (request) => {
      requests.push(request);
      return admits;
    },
  };
  return { limit, requests };
};

describe("envoi d'un message", () => {
  it("accepte un message admis par le rate limit, au nom du chatter, dans le salon donné", async () => {
    const sender = createMessageSender(makeRateLimit(true).limit);

    expect(
      await sender.send({ chatter: makeChatter(), room: ROOM, body: "salut", now: NOW }),
    ).toEqual(ok({ channelId: ROOM.channelId, authorId: "user-1", body: "salut", sentAt: NOW }));
  });

  it("demande un jeton au seau du chatter, à l'instant du message", async () => {
    const { limit, requests } = makeRateLimit(true);

    await createMessageSender(limit).send({
      chatter: makeChatter(),
      room: ROOM,
      body: "salut",
      now: NOW,
    });

    expect(requests).toEqual([{ userId: "user-1", now: NOW }]);
  });

  it("refuse rate_limited un message que le seau du chatter refuse", async () => {
    const sender = createMessageSender(makeRateLimit(false).limit);

    expect(
      await sender.send({ chatter: makeChatter(), room: ROOM, body: "salut", now: NOW }),
    ).toEqual(err("rate_limited"));
  });

  it("refuse d'abord pour la sanction, sans prendre de jeton", async () => {
    const { limit, requests } = makeRateLimit(false);

    expect(
      await createMessageSender(limit).send({
        chatter: makeChatter(TIMED_OUT_HERE),
        room: ROOM,
        body: "salut",
        now: NOW,
      }),
    ).toEqual(err("timed_out"));
    expect(requests).toEqual([]);
  });
});
