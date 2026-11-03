import { describe, expect, it } from "vitest";

import {
  type ChannelRole,
  type ChatterContext,
  activeSanction,
  chat,
  chatterContextFor,
  defineAbilityFor,
  type RoleAssignment,
} from "./index.ts";

const NOW = new Date("2026-11-03T20:00:00.000Z");
const USER_ID = "user-1";
const CHANNEL_A = "channel-a";
const CHANNEL_B = "channel-b";

const secondsFromNow = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

const onChannel = (
  role: ChannelRole,
  overrides: { channelId?: string; expiresAt?: Date | null; revokedAt?: Date | null } = {},
): RoleAssignment => ({
  role,
  scope: { type: "channel", channelId: overrides.channelId ?? CHANNEL_A },
  expiresAt: overrides.expiresAt ?? null,
  revokedAt: overrides.revokedAt ?? null,
});

const contextOf = (...assignments: readonly RoleAssignment[]): ChatterContext =>
  chatterContextFor({ userId: USER_ID, assignments, now: NOW });

const timedOut = () => contextOf(onChannel("banned", { expiresAt: secondsFromNow(600) }));

describe("chatterContextFor", () => {
  it("porte l'identité, les rôles actifs sur chaque chaîne et aucune sanction", () => {
    expect(
      contextOf(onChannel("owner"), onChannel("vip", { channelId: CHANNEL_B }), {
        role: "admin",
        scope: { type: "platform" },
        expiresAt: null,
        revokedAt: null,
      }),
    ).toEqual({
      userId: USER_ID,
      roles: [
        { channelId: CHANNEL_A, role: "owner" },
        { channelId: CHANNEL_B, role: "vip" },
      ],
      sanctions: [],
    });
  });

  it("écarte un rôle révoqué ou arrivé à échéance", () => {
    expect(
      contextOf(
        onChannel("moderator", { revokedAt: secondsFromNow(-60) }),
        onChannel("vip", { expiresAt: NOW }),
      ).roles,
    ).toEqual([]);
  });

  it("fait d'un timeout en cours une sanction sur sa chaîne, jusqu'à son échéance", () => {
    expect(contextOf(onChannel("banned", { expiresAt: secondsFromNow(600) })).sanctions).toEqual([
      { channelId: CHANNEL_A, expiresAt: secondsFromNow(600) },
    ]);
  });

  it("fait d'un ban sans échéance une sanction sans fin", () => {
    expect(contextOf(onChannel("banned")).sanctions).toEqual([
      { channelId: CHANNEL_A, expiresAt: null },
    ]);
  });

  it("n'a pas de sanction pour un ban levé ou un timeout terminé", () => {
    expect(
      contextOf(
        onChannel("banned", { revokedAt: secondsFromNow(-60) }),
        onChannel("banned", { expiresAt: NOW }),
      ).sanctions,
    ).toEqual([]);
  });

  it("garde les rôles d'un utilisateur en timeout, qui reprennent effet à la fin du timeout", () => {
    expect(
      contextOf(onChannel("moderator"), onChannel("banned", { expiresAt: secondsFromNow(600) }))
        .roles,
    ).toEqual([{ channelId: CHANNEL_A, role: "moderator" }]);
  });
});

describe("activeSanction", () => {
  it("rend le timeout de la chaîne tant qu'il court", () => {
    expect(activeSanction({ chatter: timedOut(), channelId: CHANNEL_A, now: NOW })).toEqual({
      channelId: CHANNEL_A,
      expiresAt: secondsFromNow(600),
    });
  });

  it("ne rend plus rien à l'échéance du timeout", () => {
    expect(
      activeSanction({ chatter: timedOut(), channelId: CHANNEL_A, now: secondsFromNow(600) }),
    ).toBeUndefined();
  });

  it("rend le timeout une milliseconde avant son échéance", () => {
    expect(
      activeSanction({
        chatter: timedOut(),
        channelId: CHANNEL_A,
        now: new Date(secondsFromNow(600).getTime() - 1),
      }),
    ).toBeDefined();
  });

  it("préfère le ban sans échéance à un timeout sur la même chaîne, dans tout ordre", () => {
    const timeout = onChannel("banned", { expiresAt: secondsFromNow(600) });
    const ban = onChannel("banned");

    expect([
      activeSanction({ chatter: contextOf(timeout, ban), channelId: CHANNEL_A, now: NOW }),
      activeSanction({ chatter: contextOf(ban, timeout), channelId: CHANNEL_A, now: NOW }),
    ]).toEqual([
      { channelId: CHANNEL_A, expiresAt: null },
      { channelId: CHANNEL_A, expiresAt: null },
    ]);
  });

  it("préfère le timeout qui finit le plus tard, dans tout ordre", () => {
    const short = onChannel("banned", { expiresAt: secondsFromNow(60) });
    const long = onChannel("banned", { expiresAt: secondsFromNow(600) });

    expect([
      activeSanction({ chatter: contextOf(short, long), channelId: CHANNEL_A, now: NOW }),
      activeSanction({ chatter: contextOf(long, short), channelId: CHANNEL_A, now: NOW }),
    ]).toEqual([
      { channelId: CHANNEL_A, expiresAt: secondsFromNow(600) },
      { channelId: CHANNEL_A, expiresAt: secondsFromNow(600) },
    ]);
  });

  it("ne sanctionne pas l'utilisateur sur une autre chaîne", () => {
    expect(activeSanction({ chatter: timedOut(), channelId: CHANNEL_B, now: NOW })).toBeUndefined();
  });

  it("rend un ban sans échéance, quel que soit le moment", () => {
    expect(
      activeSanction({
        chatter: contextOf(onChannel("banned")),
        channelId: CHANNEL_A,
        now: secondsFromNow(365 * 24 * 3600),
      }),
    ).toEqual({ channelId: CHANNEL_A, expiresAt: null });
  });
});

describe("accord avec l'ability CASL (ADR 0004, une seule logique d'autorisation)", () => {
  const SCENARIOS: Readonly<Record<string, readonly RoleAssignment[]>> = {
    "aucun rôle": [],
    owner: [onChannel("owner")],
    "owner en timeout": [onChannel("owner"), onChannel("banned", { expiresAt: secondsFromNow(1) })],
    "timeout terminé": [onChannel("banned", { expiresAt: NOW })],
    "ban sans échéance": [onChannel("banned")],
    "ban levé": [onChannel("banned", { revokedAt: NOW })],
    "ban sur une autre chaîne": [onChannel("banned", { channelId: CHANNEL_B })],
  };

  it.each(Object.entries(SCENARIOS))(
    "sanctionne exactement quand l'ability refuse d'écrire dans le chat : %s",
    (_name, assignments) => {
      const sanctioned =
        activeSanction({ chatter: contextOf(...assignments), channelId: CHANNEL_A, now: NOW }) !==
        undefined;

      expect(sanctioned).toBe(
        defineAbilityFor({ assignments, now: NOW }).cannot("send", chat(CHANNEL_A)),
      );
    },
  );
});
