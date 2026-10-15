import { describe, expect, it } from "vitest";

import type { LiveSession } from "./live-video-provider.ts";
import { type OpenSession, reconcileStreamSessions } from "./reconcile-stream-sessions.ts";
import type { LifecycleOutcome, ProviderLifecycleEvent } from "./record-stream-lifecycle.ts";

const NOW = new Date("2026-10-15T20:00:00.000Z");
const minutesBeforeNow = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);
const millisecondsBeforeNow = (ms: number) => new Date(NOW.getTime() - ms);

const makeOpenSession = (overrides: Partial<OpenSession> = {}): OpenSession => ({
  providerSessionId: "provider-session-1",
  providerChannelId: "provider-channel-1",
  startedAt: minutesBeforeNow(60),
  ...overrides,
});

const live = (...providerSessionIds: string[]): readonly LiveSession[] =>
  providerSessionIds.map((providerSessionId) => ({ providerSessionId }));

const setup = ({
  open,
  liveSessions,
  outcome = { status: "recorded" },
}: {
  open: readonly OpenSession[];
  liveSessions: () => Promise<readonly LiveSession[]>;
  outcome?: LifecycleOutcome;
}) => {
  const recorded: ProviderLifecycleEvent[] = [];
  const reconcile = reconcileStreamSessions({
    provider: { listLiveSessions: liveSessions },
    openSessions: { list: async () => open },
    record: async (event) => {
      recorded.push(event);
      return outcome;
    },
    endEventIdOf: (providerSessionId) => `fin-${providerSessionId}`,
  });
  return { recorded, reconcile };
};

describe("réconciliation des sessions ouvertes avec le provider (ADR 0001, 0031)", () => {
  it("clôt, par le chemin d'une fin reçue, une session ouverte que le provider ne connaît plus", async () => {
    const { recorded, reconcile } = setup({
      open: [makeOpenSession()],
      liveSessions: async () => live("autre-live"),
    });

    expect(await reconcile(NOW)).toEqual({ closed: ["provider-session-1"] });
    expect(recorded).toEqual([
      {
        eventId: "fin-provider-session-1",
        kind: "ended",
        providerChannelId: "provider-channel-1",
        providerSessionId: "provider-session-1",
        occurredAt: NOW,
      },
    ]);
  });

  it("laisse ouverte une session que le provider diffuse encore", async () => {
    const { recorded, reconcile } = setup({
      open: [
        makeOpenSession({ providerSessionId: "encore-en-direct" }),
        makeOpenSession({ providerSessionId: "oubliee", providerChannelId: "provider-channel-2" }),
      ],
      liveSessions: async () => live("encore-en-direct", "autre-live"),
    });

    expect(await reconcile(NOW)).toEqual({ closed: ["oubliee"] });
    expect(recorded.map(({ providerSessionId }) => providerSessionId)).toEqual(["oubliee"]);
  });

  it("dérive l'identifiant de chaque fin de sa session provider, pour qu'une fin rejouée par une autre instance soit reconnue comme déjà traitée", async () => {
    const { recorded, reconcile } = setup({
      open: [
        makeOpenSession({ providerSessionId: "a" }),
        makeOpenSession({ providerSessionId: "b" }),
      ],
      liveSessions: async () => live(),
    });

    await reconcile(NOW);

    expect(recorded.map(({ eventId }) => eventId)).toEqual(["fin-a", "fin-b"]);
  });

  it("laisse ouverte une session démarrée depuis moins de 5 minutes, que le provider ne liste peut-être pas encore", async () => {
    const { recorded, reconcile } = setup({
      open: [makeOpenSession({ startedAt: millisecondsBeforeNow(5 * 60_000 - 1) })],
      liveSessions: async () => live(),
    });

    expect(await reconcile(NOW)).toEqual({ closed: [] });
    expect(recorded).toEqual([]);
  });

  it("clôt une session démarrée il y a exactement 5 minutes", async () => {
    const { reconcile } = setup({
      open: [makeOpenSession({ startedAt: minutesBeforeNow(5) })],
      liveSessions: async () => live(),
    });

    expect(await reconcile(NOW)).toEqual({ closed: ["provider-session-1"] });
  });

  it("ne compte pas comme close une session dont la fin n'a rien changé", async () => {
    const { recorded, reconcile } = setup({
      open: [makeOpenSession()],
      liveSessions: async () => live(),
      outcome: { status: "unknown-channel" },
    });

    expect(await reconcile(NOW)).toEqual({ closed: [] });
    expect(recorded).toHaveLength(1);
  });

  it("ne clôt rien quand le provider ne répond pas", async () => {
    const failure = new Error("provider injoignable");
    const { recorded, reconcile } = setup({
      open: [makeOpenSession()],
      liveSessions: () => Promise.reject(failure),
    });

    await expect(reconcile(NOW)).rejects.toBe(failure);
    expect(recorded).toEqual([]);
  });
});
