import { describe, expect, it } from "vitest";

import {
  applyTurboEvent,
  type TurboEntitlement,
  type TurboEvent,
  transferTurbo,
} from "./turbo-entitlement.ts";

const USER_ID = "8d0a4c1e-5b6f-4a7d-9e8c-1f2a3b4c5d6e";
const OTHER_USER_ID = "2b7c9d1e-3f4a-4b5c-8d6e-7f8a9b0c1d2e";
const NEW_ID = "f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b";

const DAY_MS = 24 * 60 * 60 * 1000;

const at = (day: number) => new Date(Date.UTC(2026, 10, 1, 9) + (day - 1) * DAY_MS);

const newId = () => NEW_ID;

const makeEntitlement = (overrides: Partial<TurboEntitlement> = {}): TurboEntitlement => ({
  id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  userId: USER_ID,
  status: "active",
  expiresAt: at(30),
  willRenew: true,
  providerReference: "2000000123456789",
  lastEventAt: at(1),
  ...overrides,
});

const purchased = (overrides: Partial<Extract<TurboEvent, { kind: "purchased" }>> = {}) =>
  ({
    kind: "purchased",
    userId: USER_ID,
    occurredAt: at(1),
    expiresAt: at(30),
    providerReference: "2000000123456789",
    ...overrides,
  }) satisfies TurboEvent;

const apply = (current: TurboEntitlement | undefined, event: TurboEvent) =>
  applyTurboEvent({ current, event, newId });

describe("achat initial", () => {
  it("crée un entitlement actif qui renouvelle, et l'accorde jusqu'à son échéance", () => {
    expect(apply(undefined, purchased())).toEqual({
      outcome: "applied",
      saved: [
        {
          id: NEW_ID,
          userId: USER_ID,
          status: "active",
          expiresAt: at(30),
          willRenew: true,
          providerReference: "2000000123456789",
          lastEventAt: at(1),
        },
      ],
      changes: [{ type: "granted", userId: USER_ID, expiresAt: at(30) }],
    });
  });

  it.each(["expired", "revoked"] as const)(
    "recrée un entitlement après un entitlement %s",
    (status) => {
      const decision = apply(
        makeEntitlement({ status, expiresAt: at(2) }),
        purchased({ occurredAt: at(5), expiresAt: at(35) }),
      );

      expect(decision.saved).toEqual([
        expect.objectContaining({ id: NEW_ID, status: "active", expiresAt: at(35) }),
      ]);
      expect(decision.changes).toEqual([{ type: "granted", userId: USER_ID, expiresAt: at(35) }]);
    },
  );
});

describe("renouvellement", () => {
  it("prolonge l'entitlement existant sans le recréer, et accorde la nouvelle échéance", () => {
    const current = makeEntitlement();

    const decision = apply(current, {
      kind: "renewed",
      userId: USER_ID,
      occurredAt: at(29),
      expiresAt: at(59),
      providerReference: "2000000123456789",
    });

    expect(decision).toEqual({
      outcome: "applied",
      saved: [{ ...current, expiresAt: at(59), lastEventAt: at(29) }],
      changes: [{ type: "granted", userId: USER_ID, expiresAt: at(59) }],
    });
  });

  it("sort de la période de grâce et réactive le renouvellement", () => {
    const current = makeEntitlement({ status: "grace", willRenew: false, expiresAt: at(35) });

    const decision = apply(current, {
      kind: "renewed",
      userId: USER_ID,
      occurredAt: at(31),
      expiresAt: at(60),
      providerReference: undefined,
    });

    expect(decision.saved).toEqual([
      {
        ...current,
        status: "active",
        willRenew: true,
        expiresAt: at(60),
        lastEventAt: at(31),
      },
    ]);
  });

  it("n'accorde rien de nouveau quand l'échéance ne change pas", () => {
    const current = makeEntitlement();

    const decision = apply(current, purchased({ occurredAt: at(2) }));

    expect(decision).toEqual({
      outcome: "applied",
      saved: [{ ...current, lastEventAt: at(2) }],
      changes: [],
    });
  });

  it("crée l'entitlement quand l'achat initial n'est jamais arrivé", () => {
    const decision = apply(undefined, {
      kind: "renewed",
      userId: USER_ID,
      occurredAt: at(29),
      expiresAt: at(59),
      providerReference: undefined,
    });

    expect(decision.saved).toEqual([
      expect.objectContaining({ id: NEW_ID, status: "active", expiresAt: at(59) }),
    ]);
    expect(decision.changes).toEqual([{ type: "granted", userId: USER_ID, expiresAt: at(59) }]);
  });
});

describe("annulation du renouvellement", () => {
  it("garde l'accès jusqu'à l'échéance et arrête seulement le renouvellement", () => {
    const current = makeEntitlement();

    expect(
      apply(current, { kind: "renewal_cancelled", userId: USER_ID, occurredAt: at(10) }),
    ).toEqual({
      outcome: "applied",
      saved: [{ ...current, willRenew: false, lastEventAt: at(10) }],
      changes: [],
    });
  });
});

describe("problème de facturation", () => {
  it("passe en grâce sans couper l'accès, jusqu'à la fin de la grâce", () => {
    const current = makeEntitlement();

    expect(
      apply(current, {
        kind: "billing_issue",
        userId: USER_ID,
        occurredAt: at(30),
        graceEndsAt: new Date("2026-12-14T09:00:00.000Z"),
      }),
    ).toEqual({
      outcome: "applied",
      saved: [
        {
          ...current,
          status: "grace",
          expiresAt: new Date("2026-12-14T09:00:00.000Z"),
          lastEventAt: at(30),
        },
      ],
      changes: [
        { type: "granted", userId: USER_ID, expiresAt: new Date("2026-12-14T09:00:00.000Z") },
      ],
    });
  });

  it("garde l'échéance quand le fournisseur ne donne pas de fin de grâce", () => {
    const current = makeEntitlement();

    expect(
      apply(current, {
        kind: "billing_issue",
        userId: USER_ID,
        occurredAt: at(30),
        graceEndsAt: undefined,
      }),
    ).toEqual({
      outcome: "applied",
      saved: [{ ...current, status: "grace", lastEventAt: at(30) }],
      changes: [],
    });
  });
});

describe("fin de l'accès", () => {
  it.each([
    ["une expiration", "expired", "expired"],
    ["une mise en pause", "paused", "expired"],
    ["un remboursement", "refunded", "revoked"],
  ] as const)("%s coupe l'accès et le révoque", (_name, kind, status) => {
    const current = makeEntitlement();

    expect(apply(current, { kind, userId: USER_ID, occurredAt: at(12) })).toEqual({
      outcome: "applied",
      saved: [{ ...current, status, lastEventAt: at(12) }],
      changes: [{ type: "revoked", userId: USER_ID }],
    });
  });

  it("coupe aussi un accès en période de grâce", () => {
    const decision = apply(makeEntitlement({ status: "grace" }), {
      kind: "expired",
      userId: USER_ID,
      occurredAt: at(12),
    });

    expect(decision.changes).toEqual([{ type: "revoked", userId: USER_ID }]);
  });
});

describe("événement sans entitlement actif", () => {
  it.each([
    ["une annulation", { kind: "renewal_cancelled" }],
    ["un problème de facturation", { kind: "billing_issue", graceEndsAt: at(20) }],
    ["une expiration", { kind: "expired" }],
    ["un remboursement", { kind: "refunded" }],
  ] as const)("%s ne crée rien sans entitlement", (_name, partial) => {
    expect(apply(undefined, { ...partial, userId: USER_ID, occurredAt: at(5) })).toEqual({
      outcome: "ignored",
      saved: [],
      changes: [],
    });
  });

  it("une expiration ne touche pas un entitlement déjà révoqué", () => {
    expect(
      apply(makeEntitlement({ status: "revoked" }), {
        kind: "expired",
        userId: USER_ID,
        occurredAt: at(5),
      }),
    ).toEqual({ outcome: "ignored", saved: [], changes: [] });
  });
});

describe("ordre des événements", () => {
  it("ignore un événement antérieur au dernier appliqué", () => {
    const current = makeEntitlement({ lastEventAt: at(12) });

    expect(apply(current, { kind: "expired", userId: USER_ID, occurredAt: at(11) })).toEqual({
      outcome: "stale",
      saved: [],
      changes: [],
    });
  });

  it("applique un événement du même instant que le dernier appliqué", () => {
    const current = makeEntitlement({ lastEventAt: at(12) });

    expect(apply(current, { kind: "expired", userId: USER_ID, occurredAt: at(12) }).outcome).toBe(
      "applied",
    );
  });
});

describe("état relu chez le fournisseur", () => {
  it("accorde un abonnement actif inconnu chez nous", () => {
    expect(
      apply(undefined, {
        kind: "observed",
        userId: USER_ID,
        occurredAt: at(3),
        state: { expiresAt: at(30), willRenew: false, inGrace: false },
      }),
    ).toEqual({
      outcome: "applied",
      saved: [
        {
          id: NEW_ID,
          userId: USER_ID,
          status: "active",
          expiresAt: at(30),
          willRenew: false,
          providerReference: undefined,
          lastEventAt: at(3),
        },
      ],
      changes: [{ type: "granted", userId: USER_ID, expiresAt: at(30) }],
    });
  });

  it("garde la référence fournisseur connue d'un entitlement déjà actif", () => {
    const current = makeEntitlement();

    const decision = apply(current, {
      kind: "observed",
      userId: USER_ID,
      occurredAt: at(3),
      state: { expiresAt: at(30), willRenew: true, inGrace: false },
    });

    expect(decision).toEqual({
      outcome: "applied",
      saved: [{ ...current, lastEventAt: at(3) }],
      changes: [],
    });
  });

  it("passe en grâce un abonnement relu en grâce", () => {
    const decision = apply(makeEntitlement(), {
      kind: "observed",
      userId: USER_ID,
      occurredAt: at(3),
      state: { expiresAt: at(30), willRenew: true, inGrace: true },
    });

    expect(decision.saved).toEqual([expect.objectContaining({ status: "grace" })]);
  });

  it("expire un entitlement que le fournisseur ne voit plus actif", () => {
    const current = makeEntitlement();

    expect(
      apply(current, { kind: "observed", userId: USER_ID, occurredAt: at(3), state: undefined }),
    ).toEqual({
      outcome: "applied",
      saved: [{ ...current, status: "expired", lastEventAt: at(3) }],
      changes: [{ type: "revoked", userId: USER_ID }],
    });
  });

  it("n'écrit rien quand ni le fournisseur ni nous ne voyons d'abonnement", () => {
    expect(
      apply(undefined, { kind: "observed", userId: USER_ID, occurredAt: at(3), state: undefined }),
    ).toEqual({ outcome: "ignored", saved: [], changes: [] });
  });
});

describe("transfert", () => {
  it("révoque l'origine et recrée l'entitlement à l'identique sur la cible", () => {
    const origin = makeEntitlement({ willRenew: false });

    expect(
      transferTurbo({
        origins: [origin],
        target: undefined,
        toUserId: OTHER_USER_ID,
        occurredAt: at(8),
        newId,
      }),
    ).toEqual({
      outcome: "applied",
      saved: [
        { ...origin, status: "revoked", lastEventAt: at(8) },
        {
          id: NEW_ID,
          userId: OTHER_USER_ID,
          status: "active",
          expiresAt: at(30),
          willRenew: false,
          providerReference: "2000000123456789",
          lastEventAt: at(8),
        },
      ],
      changes: [
        { type: "revoked", userId: USER_ID },
        { type: "granted", userId: OTHER_USER_ID, expiresAt: at(30) },
      ],
    });
  });

  it("garde l'échéance la plus lointaine quand la cible est déjà abonnée", () => {
    const target = makeEntitlement({ id: NEW_ID, userId: OTHER_USER_ID, expiresAt: at(20) });

    const decision = transferTurbo({
      origins: [makeEntitlement({ expiresAt: at(30) })],
      target,
      toUserId: OTHER_USER_ID,
      occurredAt: at(8),
      newId,
    });

    expect(decision.saved[1]).toEqual({ ...target, expiresAt: at(30), lastEventAt: at(8) });
    expect(decision.changes[1]).toEqual({
      type: "granted",
      userId: OTHER_USER_ID,
      expiresAt: at(30),
    });
  });

  it("n'accorde rien de nouveau à une cible dont l'échéance est déjà la plus lointaine", () => {
    const target = makeEntitlement({ id: NEW_ID, userId: OTHER_USER_ID, expiresAt: at(40) });

    const decision = transferTurbo({
      origins: [makeEntitlement({ expiresAt: at(30) })],
      target,
      toUserId: OTHER_USER_ID,
      occurredAt: at(8),
      newId,
    });

    expect(decision.saved[1]).toEqual({ ...target, lastEventAt: at(8) });
    expect(decision.changes).toEqual([{ type: "revoked", userId: USER_ID }]);
  });

  it("ne transfère rien depuis une origine sans entitlement actif", () => {
    expect(
      transferTurbo({
        origins: [makeEntitlement({ status: "expired" })],
        target: undefined,
        toUserId: OTHER_USER_ID,
        occurredAt: at(8),
        newId,
      }),
    ).toEqual({ outcome: "ignored", saved: [], changes: [] });
  });

  it("ne transfère pas un entitlement dont le dernier événement est postérieur au transfert", () => {
    expect(
      transferTurbo({
        origins: [makeEntitlement({ lastEventAt: at(9) })],
        target: undefined,
        toUserId: OTHER_USER_ID,
        occurredAt: at(8),
        newId,
      }),
    ).toEqual({ outcome: "ignored", saved: [], changes: [] });
  });

  it("transfère un entitlement dont le dernier événement est du même instant que le transfert", () => {
    const decision = transferTurbo({
      origins: [makeEntitlement({ lastEventAt: at(8) })],
      target: undefined,
      toUserId: OTHER_USER_ID,
      occurredAt: at(8),
      newId,
    });

    expect(decision.outcome).toBe("applied");
  });

  it.each([
    ["dans l'ordre", [at(20), at(30)]],
    ["dans le désordre", [at(30), at(20)]],
  ] as const)(
    "recrée sur la cible l'entitlement d'origine à l'échéance la plus lointaine, %s",
    (_name, expiries) => {
      const origins = expiries.map((expiresAt, index) =>
        makeEntitlement({
          id: `0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4${index}`,
          userId: index === 0 ? USER_ID : "5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f",
          expiresAt,
          providerReference: `ref-${expiresAt.toISOString()}`,
        }),
      );

      const decision = transferTurbo({
        origins,
        target: undefined,
        toUserId: OTHER_USER_ID,
        occurredAt: at(8),
        newId,
      });

      expect(decision.saved[2]).toMatchObject({
        userId: OTHER_USER_ID,
        expiresAt: at(30),
        providerReference: `ref-${at(30).toISOString()}`,
      });
    },
  );

  it("à échéance égale, recrée l'entitlement de la première origine", () => {
    const origins = ["ref-first", "ref-second"].map((providerReference, index) =>
      makeEntitlement({
        userId: index === 0 ? USER_ID : "5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f",
        providerReference,
      }),
    );

    const decision = transferTurbo({
      origins,
      target: undefined,
      toUserId: OTHER_USER_ID,
      occurredAt: at(8),
      newId,
    });

    expect(decision.saved[2]).toMatchObject({ providerReference: "ref-first" });
  });

  it("ne touche pas une origine qui est aussi la cible", () => {
    const origin = makeEntitlement();

    expect(
      transferTurbo({
        origins: [origin],
        target: origin,
        toUserId: USER_ID,
        occurredAt: at(8),
        newId,
      }),
    ).toEqual({ outcome: "ignored", saved: [], changes: [] });
  });
});
