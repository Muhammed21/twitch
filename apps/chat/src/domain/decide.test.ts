import { describe, expect, it } from "vitest";

import { type ChatterContext, chatterContextFor, type RoleAssignment } from "@repo/authorization";

import {
  acceptMessage,
  type ChatMessage,
  isBucketFull,
  RATE_LIMIT,
  type RoomState,
  sanctionRejection,
  takeToken,
  type TokenBucket,
} from "./decide.ts";

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
  body: "Bonjour le chat",
  ...overrides,
});

type Outcome = "accepted" | "rate_limited";

const takeInSequence = (at: readonly Date[]): readonly Outcome[] =>
  at.reduce<{ bucket: TokenBucket | undefined; outcomes: readonly Outcome[] }>(
    ({ bucket, outcomes }, now) => {
      const taken = takeToken({ bucket, now });
      return taken === undefined
        ? { bucket, outcomes: [...outcomes, "rate_limited"] }
        : { bucket: taken, outcomes: [...outcomes, "accepted"] };
    },
    { bucket: undefined, outcomes: [] },
  ).outcomes;

describe("acceptMessage — message valide", () => {
  it("accepte hors live un message horodaté, sans session, au nom du chatter", () => {
    const chatter = makeChatter();

    expect(
      acceptMessage({ chatter, room: OFFLINE_ROOM, message: makeMessage(), now: NOW }),
    ).toEqual({ channelId: CHANNEL_ID, authorId: AUTHOR_ID, body: "Bonjour le chat", sentAt: NOW });
  });

  it("rattache à la session en cours un message posté pendant un live", () => {
    const chatter = makeChatter();

    expect(acceptMessage({ chatter, room: LIVE_ROOM, message: makeMessage(), now: NOW })).toEqual({
      channelId: CHANNEL_ID,
      authorId: AUTHOR_ID,
      body: "Bonjour le chat",
      sentAt: NOW,
      sessionId: SESSION_ID,
    });
  });
});

describe("sanctionRejection — sanctions", () => {
  it("refuse timed_out le message d'un chatter en timeout sur ce salon", () => {
    const chatter = makeChatter(banned());

    expect(sanctionRejection({ chatter, channelId: CHANNEL_ID, now: NOW })).toBe("timed_out");
  });

  it("laisse passer le message d'un chatter dont le timeout a expiré", () => {
    const chatter = makeChatter(banned({ expiresAt: secondsFromNow(60) }));

    expect(
      sanctionRejection({ chatter, channelId: CHANNEL_ID, now: secondsFromNow(60) }),
    ).toBeUndefined();
  });

  it("laisse passer le message d'un chatter en timeout sur un autre salon", () => {
    const chatter = makeChatter(banned({ channelId: OTHER_CHANNEL_ID }));

    expect(sanctionRejection({ chatter, channelId: CHANNEL_ID, now: NOW })).toBeUndefined();
  });

  it("donne le motif banned quand un ban sans échéance s'ajoute à un timeout", () => {
    const chatter = makeChatter(banned(), banned({ expiresAt: null }));

    expect(sanctionRejection({ chatter, channelId: CHANNEL_ID, now: NOW })).toBe("banned");
  });

  it("refuse banned le message d'un chatter banni sans échéance", () => {
    const chatter = makeChatter(banned({ expiresAt: null }));

    expect(sanctionRejection({ chatter, channelId: CHANNEL_ID, now: NOW })).toBe("banned");
  });

  it("ne sanctionne pas le propriétaire de la chaîne", () => {
    const chatter = makeChatter(OWNER);

    expect(sanctionRejection({ chatter, channelId: CHANNEL_ID, now: NOW })).toBeUndefined();
  });
});

describe("takeToken — rate limit global (1 message par seconde, rafale de 5)", () => {
  const BURST = [NOW, NOW, NOW, NOW, NOW, NOW];

  it("fixe la rafale à 5 jetons et rend un jeton toutes les 1000 ms", () => {
    expect(RATE_LIMIT).toEqual({ burst: 5, millisecondsPerToken: 1000 });
  });

  it("refuse le sixième message de la rafale", () => {
    expect(takeInSequence(BURST)).toEqual([
      "accepted",
      "accepted",
      "accepted",
      "accepted",
      "accepted",
      "rate_limited",
    ]);
  });

  it("débite un jeton d'un seau absent, qui vaut un seau plein", () => {
    expect(takeToken({ bucket: undefined, now: NOW })).toEqual({ tokens: 4, refilledAt: NOW });
  });

  it("rend un jeton par seconde écoulée, pas avant", () => {
    const afterBurst = [NOW, NOW, NOW, NOW, NOW];

    expect(
      takeInSequence([
        ...afterBurst,
        secondsFromNow(0.999),
        secondsFromNow(1),
        secondsFromNow(1),
      ]).slice(5),
    ).toEqual(["rate_limited", "accepted", "rate_limited"]);
  });

  it("plafonne la rafale à 5, même après une longue absence", () => {
    const later = secondsFromNow(3600);

    expect(takeToken({ bucket: { tokens: 0, refilledAt: NOW }, now: later })).toEqual({
      tokens: 4,
      refilledAt: later,
    });
  });

  it("consomme un jeton en tenant compte du temps écoulé depuis le dernier remplissage", () => {
    const bucket: TokenBucket = { tokens: 1.5, refilledAt: NOW };

    expect(takeToken({ bucket, now: secondsFromNow(2) })).toEqual({
      tokens: 2.5,
      refilledAt: secondsFromNow(2),
    });
  });

  it("refuse avec moins d'un jeton", () => {
    expect(takeToken({ bucket: { tokens: 0.5, refilledAt: NOW }, now: NOW })).toBeUndefined();
  });
});

describe("isBucketFull — un seau plein vaut l'absence de seau", () => {
  it("voit plein un seau remonté à 5 jetons par le temps écoulé", () => {
    const bucket: TokenBucket = { tokens: 3, refilledAt: NOW };

    expect(isBucketFull({ bucket, now: secondsFromNow(2) })).toBe(true);
  });

  it("voit entamé un seau à qui il manque encore une fraction de jeton", () => {
    const bucket: TokenBucket = { tokens: 3, refilledAt: NOW };

    expect(isBucketFull({ bucket, now: secondsFromNow(1.999) })).toBe(false);
  });
});
