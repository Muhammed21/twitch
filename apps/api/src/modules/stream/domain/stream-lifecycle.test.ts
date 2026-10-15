import { describe, expect, it } from "vitest";

import { decideLifecycle, type LifecycleEvent, type SessionState } from "./stream-lifecycle.ts";

const at = (time: string) => new Date(`2026-10-15T${time}:00.000Z`);

const NOTHING = { kind: "nothing" };

const makeSession = (overrides: Partial<SessionState> = {}): SessionState => ({
  id: "session-en-cours",
  providerSessionId: "provider-1",
  startedAt: at("20:00"),
  endedAt: null,
  ...overrides,
});

const started = (providerSessionId: string, time = "20:00"): LifecycleEvent => ({
  kind: "started",
  providerSessionId,
  occurredAt: at(time),
});

const ended = (providerSessionId: string, time = "22:00"): LifecycleEvent => ({
  kind: "ended",
  providerSessionId,
  occurredAt: at(time),
});

const decide = ({
  event,
  open = null,
  known = null,
  following = null,
}: {
  event: LifecycleEvent;
  open?: SessionState | null;
  known?: SessionState | null;
  following?: SessionState | null;
}) => decideLifecycle({ event, open, known, following });

describe("démarrage d'un live", () => {
  it("ouvre une session quand la chaîne n'en a aucune", () => {
    expect(decide({ event: started("provider-1") })).toEqual({
      kind: "apply",
      close: [],
      open: { providerSessionId: "provider-1", startedAt: at("20:00") },
    });
  });

  it("ne fait rien pour un démarrage déjà connu, même rejoué après la fin", () => {
    expect(
      decide({ event: started("provider-1"), known: makeSession({ endedAt: at("22:00") }) }),
    ).toEqual(NOTHING);
  });

  it("ne fait rien pour le démarrage de la session déjà ouverte", () => {
    const session = makeSession();

    expect(decide({ event: started("provider-1"), open: session, known: session })).toEqual(
      NOTHING,
    );
  });

  it("clôt la session restée ouverte avant d'ouvrir la nouvelle", () => {
    expect(decide({ event: started("provider-2", "21:00"), open: makeSession() })).toEqual({
      kind: "apply",
      close: [{ sessionId: "session-en-cours", endedAt: at("21:00") }],
      open: { providerSessionId: "provider-2", startedAt: at("21:00") },
    });
  });
});

describe("démarrage reçu en retard (ADR 0001, webhooks dans le désordre)", () => {
  it("archive close, jusqu'au début de la session suivante, une session plus ancienne que le live en cours", () => {
    const live = makeSession();

    expect(decide({ event: started("provider-0", "19:00"), open: live, following: live })).toEqual({
      kind: "archive",
      session: { providerSessionId: "provider-0", startedAt: at("19:00"), endedAt: at("20:00") },
    });
  });

  it("archive aussi une session plus ancienne qu'une session déjà close", () => {
    const next = makeSession({ endedAt: at("21:00") });

    expect(decide({ event: started("provider-0", "19:00"), following: next })).toEqual({
      kind: "archive",
      session: { providerSessionId: "provider-0", startedAt: at("19:00"), endedAt: at("20:00") },
    });
  });
});

describe("fin d'un live", () => {
  it("clôt la session ouverte à la date de fin", () => {
    const session = makeSession();

    expect(decide({ event: ended("provider-1"), open: session, known: session })).toEqual({
      kind: "apply",
      close: [{ sessionId: "session-en-cours", endedAt: at("22:00") }],
      open: null,
    });
  });

  it("ne clôt jamais une session avant son début", () => {
    const session = makeSession();

    expect(
      decide({ event: ended("provider-1", "19:00"), open: session, known: session }),
    ).toMatchObject({ close: [{ sessionId: "session-en-cours", endedAt: at("20:00") }] });
  });

  it("ne fait rien pour une session déjà close", () => {
    expect(
      decide({ event: ended("provider-1"), known: makeSession({ endedAt: at("22:00") }) }),
    ).toEqual(NOTHING);
  });

  it("attend le démarrage d'une session encore inconnue", () => {
    expect(decide({ event: ended("provider-9"), open: makeSession() })).toEqual({
      kind: "wait-for-start",
    });
  });
});
