import { describe, expect, it } from "vitest";

import { type ChannelRole, inMemoryAuthzContext, type RoleAssignment } from "@repo/authorization";

import {
  type SanctionedAssignmentsCache,
  type TimeoutLedger,
  type TimeoutRecord,
  timeoutUser,
} from "./timeout-user.ts";

const NOW = new Date("2026-10-15T20:00:00.000Z");
const CHANNEL_ID = "9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69";
const OTHER_CHANNEL_ID = "8a7f6e5d-4c3b-4a29-8f10-0e1d2c3b4a58";
const OWNER = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const VIEWER = "6b4c1e3a-9d5f-4a0c-b132-4e7f8a9b0c1d";
const ACTOR = "5a3b0d2f-8c4e-4f9b-a021-3d6e7f8a9b0c";
const TIMEOUT_ID = "00000000-0000-4000-8000-000000000001";
const EVENT_ID = "00000000-0000-4000-8000-000000000002";

const roleOn = (role: ChannelRole, channelId = CHANNEL_ID): RoleAssignment => ({
  role,
  scope: { type: "channel", channelId },
  expiresAt: null,
  revokedAt: null,
});

const memoryLedger = () => {
  const records: TimeoutRecord[] = [];
  const ledger: TimeoutLedger = {
    record: async (timeout) => {
      records.push(timeout);
    },
  };
  return { records, ledger };
};

const recordingCache = ({
  records,
  failing = false,
}: {
  records: readonly TimeoutRecord[];
  failing?: boolean;
}) => {
  const invalidations: { userId: string; recordsBefore: number }[] = [];
  const cache: SanctionedAssignmentsCache = {
    invalidate: async (userId) => {
      invalidations.push({ userId, recordsBefore: records.length });
      if (failing) {
        throw new Error("redis indisponible");
      }
    },
  };
  return { invalidations, cache };
};

const ids = () => {
  const queue = [TIMEOUT_ID, EVENT_ID];
  return () => queue.shift() ?? "00000000-0000-4000-8000-0000000000ff";
};

const setUp = ({
  assignments = { [OWNER]: [roleOn("owner")] },
  failingCache = false,
}: {
  assignments?: Readonly<Record<string, readonly RoleAssignment[]>>;
  failingCache?: boolean;
} = {}) => {
  const { records, ledger } = memoryLedger();
  const { invalidations, cache } = recordingCache({ records, failing: failingCache });
  const timeout = timeoutUser({
    authz: inMemoryAuthzContext({ assignments, now: () => NOW }),
    ledger,
    cache,
    newId: ids(),
    now: () => NOW,
  });
  return { records, invalidations, timeout };
};

const request = (overrides: Partial<Parameters<ReturnType<typeof timeoutUser>>[0]> = {}) => ({
  actorId: OWNER,
  channelId: CHANNEL_ID,
  targetId: VIEWER,
  durationSeconds: 600,
  ...overrides,
});

describe("timeout d'un utilisateur par le propriétaire de la chaîne", () => {
  it("enregistre le timeout avec l'acteur et sa fin, puis invalide les attributions du sanctionné", async () => {
    const { records, invalidations, timeout } = setUp();

    const outcome = await timeout(request());

    expect(outcome).toEqual({
      ok: true,
      value: {
        channelId: CHANNEL_ID,
        userId: VIEWER,
        expiresAt: new Date("2026-10-15T20:10:00.000Z"),
        cacheInvalidated: true,
      },
    });
    expect(records).toEqual([
      {
        timeoutId: TIMEOUT_ID,
        outboxEventId: EVENT_ID,
        channelId: CHANNEL_ID,
        targetId: VIEWER,
        actorId: OWNER,
        issuedAt: NOW,
        expiresAt: new Date("2026-10-15T20:10:00.000Z"),
      },
    ]);
    expect(invalidations).toEqual([{ userId: VIEWER, recordsBefore: 1 }]);
  });

  it("garde le timeout enregistré quand l'invalidation du cache échoue", async () => {
    const { records, timeout } = setUp({ failingCache: true });

    const outcome = await timeout(request());

    expect(outcome).toMatchObject({ ok: true, value: { cacheInvalidated: false } });
    expect(records).toHaveLength(1);
  });

  it("laisse aussi un modérateur de la chaîne mettre en timeout (matrice de l'ADR 0006)", async () => {
    const { records, timeout } = setUp({ assignments: { [ACTOR]: [roleOn("moderator")] } });

    expect(await timeout(request({ actorId: ACTOR }))).toMatchObject({ ok: true });
    expect(records).toHaveLength(1);
  });
});

describe("refus d'un timeout", () => {
  it.each([
    ["un compte sans rôle", []],
    ["un editor", [roleOn("editor")]],
    ["un vip", [roleOn("vip")]],
    ["le propriétaire d'une autre chaîne", [roleOn("owner", OTHER_CHANNEL_ID)]],
    ["un propriétaire banni de sa chaîne", [roleOn("owner"), roleOn("banned")]],
  ])("refuse à %s, sans rien écrire", async (_name, actorAssignments) => {
    const { records, invalidations, timeout } = setUp({
      assignments: { [ACTOR]: actorAssignments },
    });

    expect(await timeout(request({ actorId: ACTOR }))).toEqual({ ok: false, error: "forbidden" });
    expect(records).toEqual([]);
    expect(invalidations).toEqual([]);
  });

  it("refuse de sanctionner le propriétaire, même par lui-même", async () => {
    const { records, timeout } = setUp();

    expect(await timeout(request({ targetId: OWNER }))).toEqual({ ok: false, error: "forbidden" });
    expect(records).toEqual([]);
  });

  it("refuse au modérateur de sanctionner un autre modérateur de la chaîne", async () => {
    const { records, timeout } = setUp({
      assignments: { [ACTOR]: [roleOn("moderator")], [VIEWER]: [roleOn("moderator")] },
    });

    expect(await timeout(request({ actorId: ACTOR }))).toEqual({ ok: false, error: "forbidden" });
    expect(records).toEqual([]);
  });

  it("lit les rôles de la cible à l'instant du timeout", async () => {
    const formerModerator: RoleAssignment = {
      ...roleOn("moderator"),
      expiresAt: new Date(NOW.getTime() - 1000),
    };
    const { timeout } = setUp({
      assignments: { [ACTOR]: [roleOn("moderator")], [VIEWER]: [formerModerator] },
    });

    expect(await timeout(request({ actorId: ACTOR }))).toMatchObject({ ok: true });
  });

  it.each([0, 1_209_601, 1.5])(
    "refuse une durée de %d secondes, sans rien écrire",
    async (seconds) => {
      const { records, invalidations, timeout } = setUp();

      expect(await timeout(request({ durationSeconds: seconds }))).toEqual({
        ok: false,
        error: "invalid_duration",
      });
      expect(records).toEqual([]);
      expect(invalidations).toEqual([]);
    },
  );

  it("répond forbidden avant de juger la durée, pour un compte sans droit", async () => {
    const { timeout } = setUp({ assignments: {} });

    expect(await timeout(request({ actorId: ACTOR, durationSeconds: 0 }))).toEqual({
      ok: false,
      error: "forbidden",
    });
  });
});
