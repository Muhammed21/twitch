import { describe, expect, it } from "vitest";

import { decideLifecycle, type LifecycleEvent, type SessionState } from "./stream-lifecycle.ts";

const at = (time: string) => new Date(`2026-10-15T${time}:00.000Z`);

const NOTHING = { close: [], open: null };

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

describe("démarrage d'un live", () => {
  it("ouvre une session quand la chaîne n'en a aucune", () => {
    expect(decideLifecycle({ event: started("provider-1"), open: null, known: null })).toEqual({
      close: [],
      open: { providerSessionId: "provider-1", startedAt: at("20:00") },
    });
  });

  it("ne fait rien pour un démarrage déjà connu, même rejoué après la fin", () => {
    const session = makeSession({ endedAt: at("22:00") });

    expect(decideLifecycle({ event: started("provider-1"), open: null, known: session })).toEqual(
      NOTHING,
    );
  });

  it("ne fait rien pour le démarrage de la session déjà ouverte", () => {
    const session = makeSession();

    expect(
      decideLifecycle({ event: started("provider-1"), open: session, known: session }),
    ).toEqual(NOTHING);
  });

  it("clôt la session restée ouverte avant d'ouvrir la nouvelle", () => {
    expect(
      decideLifecycle({ event: started("provider-2", "21:00"), open: makeSession(), known: null }),
    ).toEqual({
      close: [{ sessionId: "session-en-cours", endedAt: at("21:00") }],
      open: { providerSessionId: "provider-2", startedAt: at("21:00") },
    });
  });

  it("ne clôt jamais une session avant son début", () => {
    expect(
      decideLifecycle({ event: started("provider-2", "19:00"), open: makeSession(), known: null }),
    ).toMatchObject({ close: [{ sessionId: "session-en-cours", endedAt: at("20:00") }] });
  });
});

describe("fin d'un live", () => {
  it("clôt la session ouverte à la date de fin", () => {
    const session = makeSession();

    expect(decideLifecycle({ event: ended("provider-1"), open: session, known: session })).toEqual({
      close: [{ sessionId: "session-en-cours", endedAt: at("22:00") }],
      open: null,
    });
  });

  it("ne clôt jamais une session avant son début", () => {
    const session = makeSession();

    expect(
      decideLifecycle({ event: ended("provider-1", "19:00"), open: session, known: session }),
    ).toMatchObject({ close: [{ sessionId: "session-en-cours", endedAt: at("20:00") }] });
  });

  it("ne fait rien pour une session déjà close", () => {
    const session = makeSession({ endedAt: at("22:00") });

    expect(decideLifecycle({ event: ended("provider-1"), open: null, known: session })).toEqual(
      NOTHING,
    );
  });

  it("ne fait rien pour une session inconnue", () => {
    expect(
      decideLifecycle({ event: ended("provider-9"), open: makeSession(), known: null }),
    ).toEqual(NOTHING);
  });
});
