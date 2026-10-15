import { describe, expect, it } from "vitest";

import {
  type ChannelRole,
  channel,
  channelMember,
  channelRole,
  chat,
  defineAbilityFor,
  type PlatformRole,
  type RoleAssignment,
} from "./ability.ts";

const NOW = new Date("2026-10-12T12:00:00.000Z");
const CHANNEL_A = "channel-a";
const CHANNEL_B = "channel-b";

const secondsFromNow = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

const onChannel = (
  role: ChannelRole,
  overrides: Partial<Omit<RoleAssignment, "role" | "scope">> & { channelId?: string } = {},
): RoleAssignment => ({
  role,
  scope: { type: "channel", channelId: overrides.channelId ?? CHANNEL_A },
  expiresAt: overrides.expiresAt ?? null,
  revokedAt: overrides.revokedAt ?? null,
});

const onPlatform = (role: PlatformRole): RoleAssignment => ({
  role,
  scope: { type: "platform" },
  expiresAt: null,
  revokedAt: null,
});

const abilityOf = (...assignments: readonly RoleAssignment[]) =>
  defineAbilityFor({ assignments, now: NOW });

const ORDINARY_MEMBER = channelMember({ channelId: CHANNEL_A, targetAssignments: [], now: NOW });

const memberWith = (...targetAssignments: readonly RoleAssignment[]) =>
  channelMember({ channelId: CHANNEL_A, targetAssignments, now: NOW });

type Ability = ReturnType<typeof abilityOf>;

const ACTIONS: Readonly<Record<string, (ability: Ability) => boolean>> = {
  "channel.update": (ability) => ability.can("update", channel(CHANNEL_A)),
  "channel.streamKey.read": (ability) => ability.can("readStreamKey", channel(CHANNEL_A)),
  "channel.streamKey.rotate": (ability) => ability.can("rotateStreamKey", channel(CHANNEL_A)),
  "role.grant editor": (ability) => ability.can("grant", channelRole(CHANNEL_A, "editor")),
  "role.grant vip": (ability) => ability.can("grant", channelRole(CHANNEL_A, "vip")),
  "moderator.appoint": (ability) => ability.can("grant", channelRole(CHANNEL_A, "moderator")),
  "member.timeout": (ability) => ability.can("timeout", ORDINARY_MEMBER),
  "member.ban": (ability) => ability.can("ban", ORDINARY_MEMBER),
  "chat.send": (ability) => ability.can("send", chat(CHANNEL_A)),
};

const ROLES: Readonly<Record<string, readonly RoleAssignment[]>> = {
  owner: [onChannel("owner")],
  editor: [onChannel("editor")],
  moderator: [onChannel("moderator")],
  vip: [onChannel("vip")],
  aucun: [],
  banni: [onChannel("banned")],
};

const MATRIX: Readonly<Record<string, readonly string[]>> = {
  "channel.update": ["owner", "editor"],
  "channel.streamKey.read": ["owner"],
  "channel.streamKey.rotate": ["owner"],
  "role.grant editor": ["owner"],
  "role.grant vip": ["owner", "editor"],
  "moderator.appoint": ["owner"],
  "member.timeout": ["owner", "moderator"],
  "member.ban": ["owner", "moderator"],
  "chat.send": ["owner", "editor", "moderator", "vip", "aucun"],
};

const CELLS = Object.entries(MATRIX).flatMap(([action, allowed]) =>
  Object.keys(ROLES).map((role) => [action, role, allowed.includes(role)] as const),
);

describe("matrice des droits de la tranche 1 (ADR 0006)", () => {
  it.each(CELLS)("%s pour %s : autorisé = %s", (action, role, expected) => {
    const check = ACTIONS[action];
    const assignments = ROLES[role];
    expect(check !== undefined && assignments !== undefined).toBe(true);

    expect(check?.(abilityOf(...(assignments ?? [])))).toBe(expected);
  });
});

describe("protection des cibles d'une sanction", () => {
  it.each(["timeout", "ban"] as const)("refuse %s sur le owner, même au owner", (action) => {
    expect(abilityOf(onChannel("owner")).can(action, memberWith(onChannel("owner")))).toBe(false);
  });

  it.each([
    ["un modérateur", onChannel("moderator")],
    ["un editor", onChannel("editor")],
  ])("refuse au modérateur de sanctionner %s", (_name, target) => {
    expect(abilityOf(onChannel("moderator")).can("timeout", memberWith(target))).toBe(false);
  });

  it.each([
    ["un modérateur", onChannel("moderator")],
    ["un editor", onChannel("editor")],
    ["un vip", onChannel("vip")],
  ])("laisse le owner sanctionner %s", (_name, target) => {
    expect(abilityOf(onChannel("owner")).can("ban", memberWith(target))).toBe(true);
  });

  it("ne protège pas une cible pour un rôle tenu sur une autre chaîne", () => {
    const moderatorElsewhere = memberWith(onChannel("moderator", { channelId: CHANNEL_B }));

    expect(abilityOf(onChannel("moderator")).can("timeout", moderatorElsewhere)).toBe(true);
  });

  it("ne protège pas une cible pour un rôle révoqué ou expiré", () => {
    const formerModerator = memberWith(
      onChannel("moderator", { revokedAt: secondsFromNow(-60) }),
      onChannel("editor", { expiresAt: secondsFromNow(-60) }),
    );

    expect(abilityOf(onChannel("moderator")).can("timeout", formerModerator)).toBe(true);
  });
});

describe("portée par chaîne", () => {
  it("modérateur de A et banni de B au même instant", () => {
    const ability = abilityOf(
      onChannel("moderator"),
      onChannel("banned", { channelId: CHANNEL_B }),
    );

    expect(ability.can("timeout", ORDINARY_MEMBER)).toBe(true);
    expect(ability.can("send", chat(CHANNEL_A))).toBe(true);
    expect(ability.can("send", chat(CHANNEL_B))).toBe(false);
  });

  it("refuse une attribution hors de la portée de l'acteur (escalade)", () => {
    const editorOfA = abilityOf(onChannel("editor"));

    expect(editorOfA.can("grant", channelRole(CHANNEL_A, "vip"))).toBe(true);
    expect(editorOfA.can("grant", channelRole(CHANNEL_B, "vip"))).toBe(false);
  });

  it("ne donne aucun droit sur une autre chaîne", () => {
    const ownerOfA = abilityOf(onChannel("owner"));
    const memberOfB = channelMember({ channelId: CHANNEL_B, targetAssignments: [], now: NOW });

    expect(ownerOfA.can("update", channel(CHANNEL_B))).toBe(false);
    expect(ownerOfA.can("readStreamKey", channel(CHANNEL_B))).toBe(false);
    expect(ownerOfA.can("rotateStreamKey", channel(CHANNEL_B))).toBe(false);
    expect(ownerOfA.can("grant", channelRole(CHANNEL_B, "moderator"))).toBe(false);
    expect(ownerOfA.can("ban", memberOfB)).toBe(false);
  });

  it("ne laisse pas l'editor d'une chaîne en modifier une autre", () => {
    expect(abilityOf(onChannel("editor")).can("update", channel(CHANNEL_B))).toBe(false);
  });

  it.each(["owner", "editor", "moderator"] as const)(
    "retire au %s banni tous ses droits sur la chaîne, quel que soit l'ordre des attributions",
    (role) => {
      const banned = onChannel("banned", { expiresAt: secondsFromNow(600) });
      const abilities = [abilityOf(onChannel(role), banned), abilityOf(banned, onChannel(role))];

      abilities.forEach((ability) =>
        expect(Object.values(ACTIONS).map((check) => check(ability))).toEqual(
          Object.values(ACTIONS).map(() => false),
        ),
      );
    },
  );

  it("garde au owner banni d'une chaîne ses droits sur sa propre chaîne", () => {
    const ability = abilityOf(onChannel("owner", { channelId: CHANNEL_B }), onChannel("banned"));

    const memberOfB = channelMember({ channelId: CHANNEL_B, targetAssignments: [], now: NOW });

    expect(ability.can("update", channel(CHANNEL_B))).toBe(true);
    expect(ability.can("readStreamKey", channel(CHANNEL_B))).toBe(true);
    expect(ability.can("rotateStreamKey", channel(CHANNEL_B))).toBe(true);
    expect(ability.can("grant", channelRole(CHANNEL_B, "moderator"))).toBe(true);
    expect(ability.can("ban", memberOfB)).toBe(true);
    expect(ability.can("send", chat(CHANNEL_B))).toBe(true);
    expect(ability.can("update", channel(CHANNEL_A))).toBe(false);
  });

  it("garde le banni d'une chaîne interdit de chat même s'il y tient un autre rôle", () => {
    expect(abilityOf(onChannel("vip"), onChannel("banned")).can("send", chat(CHANNEL_A))).toBe(
      false,
    );
  });
});

describe("attributions dans le temps", () => {
  it("ne restreint plus après l'expiration d'un timeout", () => {
    const expired = abilityOf(onChannel("banned", { expiresAt: secondsFromNow(-1) }));

    expect(expired.can("send", chat(CHANNEL_A))).toBe(true);
  });

  it("restreint pendant un timeout, jusqu'à son échéance exclue", () => {
    const running = abilityOf(onChannel("banned", { expiresAt: secondsFromNow(1) }));
    const atDeadline = abilityOf(onChannel("banned", { expiresAt: NOW }));

    expect(running.can("send", chat(CHANNEL_A))).toBe(false);
    expect(atDeadline.can("send", chat(CHANNEL_A))).toBe(true);
  });

  it("ignore une attribution révoquée", () => {
    const revokedOwner = abilityOf(onChannel("owner", { revokedAt: secondsFromNow(-1) }));

    expect(revokedOwner.can("update", channel(CHANNEL_A))).toBe(false);
  });
});

describe("rôles de plateforme", () => {
  it.each(["staff", "admin"] as const)("%s peut suspendre n'importe quelle chaîne", (role) => {
    const ability = abilityOf(onPlatform(role));

    expect(ability.can("suspend", channel(CHANNEL_A))).toBe(true);
    expect(ability.can("suspend", channel(CHANNEL_B))).toBe(true);
  });

  it.each(["staff", "admin", "support"] as const)("%s n'hérite d'aucun droit de chaîne", (role) => {
    const ability = abilityOf(onPlatform(role));

    expect(ability.can("update", channel(CHANNEL_A))).toBe(false);
    expect(ability.can("ban", ORDINARY_MEMBER)).toBe(false);
    expect(ability.can("grant", channelRole(CHANNEL_A, "moderator"))).toBe(false);
  });

  it.each([
    ["support", [onPlatform("support")]],
    ["owner", [onChannel("owner")]],
  ] as const)("refuse la suspension à %s", (_name, assignments) => {
    expect(abilityOf(...assignments).can("suspend", channel(CHANNEL_A))).toBe(false);
  });
});
