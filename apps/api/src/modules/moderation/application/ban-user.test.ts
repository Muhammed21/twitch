import { describe, expect, it } from "vitest";

import {
  type ChannelRole,
  inMemoryAuthzContext,
  type PlatformRole,
  type RoleAssignment,
} from "@repo/authorization";

import type { AuditActor } from "../../../platform/audit-actor.ts";
import { type BanLedger, type BanRecord, type BanRequest, banUser } from "./ban-user.ts";
import type { SanctionedAssignmentsCache } from "./timeout-user.ts";

const NOW = new Date("2026-11-06T12:00:00.000Z");
const CHANNEL_ID = "9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69";
const OTHER_CHANNEL_ID = "8a7f6e5d-4c3b-4a29-8f10-0e1d2c3b4a58";
const MODERATOR = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const VIEWER = "6b4c1e3a-9d5f-4a0c-b132-4e7f8a9b0c1d";
const BAN_ID = "00000000-0000-4000-8000-000000000001";
const EVENT_ID = "00000000-0000-4000-8000-000000000002";

const PAYLOAD_MODERATOR: AuditActor = {
  actorId: MODERATOR,
  onBehalfOf: "svc:payload-admin",
  source: "payload",
};

const roleOn = (role: ChannelRole, channelId = CHANNEL_ID): RoleAssignment => ({
  role,
  scope: { type: "channel", channelId },
  expiresAt: null,
  revokedAt: null,
});

const onPlatform = (role: PlatformRole): RoleAssignment => ({
  role,
  scope: { type: "platform" },
  expiresAt: null,
  revokedAt: null,
});

const ids = () => {
  const queue = [BAN_ID, EVENT_ID];
  return () => queue.shift() ?? "00000000-0000-4000-8000-0000000000ff";
};

const setUp = ({
  assignments = { [MODERATOR]: [roleOn("moderator")] },
  failingCache = false,
}: {
  assignments?: Readonly<Record<string, readonly RoleAssignment[]>>;
  failingCache?: boolean;
} = {}) => {
  const records: BanRecord[] = [];
  const invalidations: { userId: string; recordsBefore: number }[] = [];
  const ledger: BanLedger = {
    record: async (ban) => {
      records.push(ban);
    },
  };
  const cache: SanctionedAssignmentsCache = {
    invalidate: async (userId) => {
      invalidations.push({ userId, recordsBefore: records.length });
      if (failingCache) {
        throw new Error("redis indisponible");
      }
    },
  };
  const ban = banUser({
    authz: inMemoryAuthzContext({ assignments, now: () => NOW }),
    ledger,
    cache,
    newId: ids(),
    now: () => NOW,
  });
  return { records, invalidations, ban };
};

const makeRequest = (overrides: Partial<BanRequest> = {}): BanRequest => ({
  actor: PAYLOAD_MODERATOR,
  channelId: CHANNEL_ID,
  targetId: VIEWER,
  durationMinutes: 60,
  reason: "Harcèlement",
  ...overrides,
});

describe("bannissement d'un utilisateur d'une chaîne", () => {
  it("enregistre le ban avec l'acteur complet, sa fin et son motif, puis invalide les attributions du banni", async () => {
    const { records, invalidations, ban } = setUp();

    const outcome = await ban(makeRequest({ reason: "  Harcèlement " }));

    expect(outcome).toEqual({
      ok: true,
      value: {
        channelId: CHANNEL_ID,
        userId: VIEWER,
        expiresAt: new Date("2026-11-06T13:00:00.000Z"),
        reason: "Harcèlement",
        cacheInvalidated: true,
      },
    });
    expect(records).toEqual([
      {
        banId: BAN_ID,
        outboxEventId: EVENT_ID,
        actor: PAYLOAD_MODERATOR,
        channelId: CHANNEL_ID,
        targetId: VIEWER,
        issuedAt: NOW,
        expiresAt: new Date("2026-11-06T13:00:00.000Z"),
        reason: "Harcèlement",
      },
    ]);
    expect(invalidations).toEqual([{ userId: VIEWER, recordsBefore: 1 }]);
  });

  it("enregistre un ban définitif sans fin", async () => {
    const { records, ban } = setUp();

    const outcome = await ban(makeRequest({ durationMinutes: null }));

    expect(outcome.ok && outcome.value.expiresAt).toBeNull();
    expect(records.map((record) => record.expiresAt)).toEqual([null]);
  });

  it("garde le ban enregistré quand l'invalidation du cache échoue", async () => {
    const { records, ban } = setUp({ failingCache: true });

    const outcome = await ban(makeRequest());

    expect(outcome.ok && outcome.value.cacheInvalidated).toBe(false);
    expect(records).toHaveLength(1);
  });

  it("laisse le propriétaire de la chaîne bannir", async () => {
    const { records, ban } = setUp({ assignments: { [MODERATOR]: [roleOn("owner")] } });

    expect((await ban(makeRequest())).ok).toBe(true);
    expect(records).toHaveLength(1);
  });
});

describe("refus d'un bannissement", () => {
  it.each([
    ["sans aucun rôle", []],
    ["modérateur d'une autre chaîne", [roleOn("moderator", OTHER_CHANNEL_ID)]],
    ["vip de la chaîne", [roleOn("vip")]],
    ["administrateur de la plateforme seulement", [onPlatform("admin")]],
  ] as const)("refuse un humain %s, sans rien enregistrer", async (_name, roles) => {
    const { records, invalidations, ban } = setUp({ assignments: { [MODERATOR]: roles } });

    expect(await ban(makeRequest())).toEqual({ ok: false, error: "forbidden" });
    expect(records).toEqual([]);
    expect(invalidations).toEqual([]);
  });

  it("refuse de bannir le propriétaire de la chaîne", async () => {
    const { records, ban } = setUp({
      assignments: { [MODERATOR]: [roleOn("moderator")], [VIEWER]: [roleOn("owner")] },
    });

    expect(await ban(makeRequest())).toEqual({ ok: false, error: "forbidden" });
    expect(records).toEqual([]);
  });

  it("refuse une durée invalide, sans rien enregistrer", async () => {
    const { records, ban } = setUp();

    expect(await ban(makeRequest({ durationMinutes: 0 }))).toEqual({
      ok: false,
      error: "invalid_duration",
    });
    expect(records).toEqual([]);
  });

  it("refuse un motif vide, sans rien enregistrer", async () => {
    const { records, ban } = setUp();

    expect(await ban(makeRequest({ reason: "  " }))).toEqual({
      ok: false,
      error: "invalid_reason",
    });
    expect(records).toEqual([]);
  });

  it("refuse un humain sans droit avant de lire la durée", async () => {
    const { ban } = setUp({ assignments: {} });

    expect(await ban(makeRequest({ durationMinutes: 0, reason: "" }))).toEqual({
      ok: false,
      error: "forbidden",
    });
  });
});
