import { describe, expect, it } from "vitest";

import { type ChatterContext, chatterContextFor, type RoleAssignment } from "@repo/authorization";
import { err, ok } from "@repo/result";

import { type ChatMessage, decide, type RoomState, type TokenBucket } from "./decide.ts";

const NOW = new Date("2026-11-03T20:00:00.000Z");
const CHANNEL_ID = "channel-a";
const OTHER_CHANNEL_ID = "channel-b";
const AUTHOR_ID = "user-1";
const SESSION_ID = "session-1";

const secondsFromNow = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

const banned = (
  overrides: { channelId?: string; expiresAt?: Date | null } = {},
): RoleAssignment => ({
  role: "banned",
  scope: { type: "channel", channelId: overrides.channelId ?? CHANNEL_ID },
  expiresAt: overrides.expiresAt === undefined ? secondsFromNow(600) : overrides.expiresAt,
  revokedAt: null,
});

const OWNER: RoleAssignment = {
  role: "owner",
  scope: { type: "channel", channelId: CHANNEL_ID },
  expiresAt: null,
  revokedAt: null,
};

const makeChatter = (...assignments: readonly RoleAssignment[]): ChatterContext =>
  chatterContextFor({ userId: AUTHOR_ID, assignments, now: NOW });

const OFFLINE_ROOM: RoomState = { channelId: CHANNEL_ID, sessionId: null };
const LIVE_ROOM: RoomState = { channelId: CHANNEL_ID, sessionId: SESSION_ID };

const makeMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  channelId: CHANNEL_ID,
  body: "Bonjour le chat",
  ...overrides,
});

type Input = Parameters<typeof decide>[0];

const makeInput = (overrides: Partial<Input> = {}): Input => ({
  chatter: makeChatter(),
  room: OFFLINE_ROOM,
  message: makeMessage(),
  bucket: undefined,
  now: NOW,
  ...overrides,
});

const sendInSequence = ({
  chatter,
  at,
}: {
  chatter: ChatterContext;
  at: readonly Date[];
}): readonly ReturnType<typeof decide>[] =>
  at.reduce<{ bucket: TokenBucket | undefined; decisions: readonly ReturnType<typeof decide>[] }>(
    ({ bucket, decisions }, now) => {
      const decision = decide(makeInput({ chatter, bucket, now }));
      return {
        bucket: decision.ok ? decision.value.bucket : bucket,
        decisions: [...decisions, decision],
      };
    },
    { bucket: undefined, decisions: [] },
  ).decisions;

const outcomes = (decisions: readonly ReturnType<typeof decide>[]) =>
  decisions.map((decision) => (decision.ok ? "accepted" : decision.error));

describe("decide — message valide", () => {
  it("accepte hors live un message horodaté, sans session, au nom du chatter", () => {
    expect(decide(makeInput({ room: OFFLINE_ROOM }))).toEqual(
      ok({
        message: {
          channelId: CHANNEL_ID,
          authorId: AUTHOR_ID,
          body: "Bonjour le chat",
          sentAt: NOW,
        },
        bucket: { tokens: 4, refilledAt: NOW },
      }),
    );
  });

  it("rattache à la session en cours un message posté pendant un live", () => {
    const decision = decide(makeInput({ room: LIVE_ROOM }));

    expect(decision.ok && decision.value.message).toEqual({
      channelId: CHANNEL_ID,
      authorId: AUTHOR_ID,
      body: "Bonjour le chat",
      sentAt: NOW,
      sessionId: SESSION_ID,
    });
  });
});

describe("decide — sanctions", () => {
  it("refuse timed_out le message d'un chatter en timeout sur ce salon", () => {
    expect(decide(makeInput({ chatter: makeChatter(banned()) }))).toEqual(err("timed_out"));
  });

  it("accepte le message d'un chatter dont le timeout a expiré", () => {
    const chatter = makeChatter(banned({ expiresAt: secondsFromNow(60) }));

    expect(decide(makeInput({ chatter, now: secondsFromNow(60) })).ok).toBe(true);
  });

  it("accepte le message d'un chatter en timeout sur un autre salon", () => {
    const chatter = makeChatter(banned({ channelId: OTHER_CHANNEL_ID }));

    expect(decide(makeInput({ chatter })).ok).toBe(true);
  });

  it("refuse banned le message d'un chatter banni sans échéance", () => {
    expect(decide(makeInput({ chatter: makeChatter(banned({ expiresAt: null })) }))).toEqual(
      err("banned"),
    );
  });

  it("refuse d'abord pour la sanction, même quand le rate limit est épuisé", () => {
    const chatter = makeChatter(banned());

    expect(decide(makeInput({ chatter, bucket: { tokens: 0, refilledAt: NOW } }))).toEqual(
      err("timed_out"),
    );
  });
});

describe("decide — rate limit global (1 message par seconde, rafale de 5)", () => {
  const BURST = [NOW, NOW, NOW, NOW, NOW, NOW];

  it("refuse rate_limited le sixième message de la rafale", () => {
    expect(outcomes(sendInSequence({ chatter: makeChatter(), at: BURST }))).toEqual([
      "accepted",
      "accepted",
      "accepted",
      "accepted",
      "accepted",
      "rate_limited",
    ]);
  });

  it("soumet le propriétaire de la chaîne au rate limit comme les autres", () => {
    expect(outcomes(sendInSequence({ chatter: makeChatter(OWNER), at: BURST })).at(-1)).toBe(
      "rate_limited",
    );
  });

  it("rend un jeton par seconde écoulée, pas avant", () => {
    const afterBurst = [NOW, NOW, NOW, NOW, NOW];

    expect(
      outcomes(
        sendInSequence({
          chatter: makeChatter(),
          at: [...afterBurst, secondsFromNow(0.999), secondsFromNow(1), secondsFromNow(1)],
        }),
      ).slice(5),
    ).toEqual(["rate_limited", "accepted", "rate_limited"]);
  });

  it("plafonne la rafale à 5, même après une longue absence", () => {
    const bucket: TokenBucket = { tokens: 0, refilledAt: NOW };
    const later = secondsFromNow(3600);
    const decision = decide(makeInput({ bucket, now: later }));

    expect(decision.ok && decision.value.bucket).toEqual({ tokens: 4, refilledAt: later });
  });

  it("consomme un jeton en tenant compte du temps écoulé depuis le dernier remplissage", () => {
    const bucket: TokenBucket = { tokens: 1.5, refilledAt: NOW };
    const decision = decide(makeInput({ bucket, now: secondsFromNow(2) }));

    expect(decision.ok && decision.value.bucket).toEqual({
      tokens: 2.5,
      refilledAt: secondsFromNow(2),
    });
  });

  it("refuse avec moins d'un jeton, sans rien consommer", () => {
    expect(decide(makeInput({ bucket: { tokens: 0.5, refilledAt: NOW } }))).toEqual(
      err("rate_limited"),
    );
  });
});
