import { describe, expect, it } from "vitest";

import type { SessionState } from "../domain/stream-lifecycle.ts";
import {
  type LifecycleTransaction,
  type ProviderLifecycleEvent,
  recordStreamLifecycle,
  type StreamLifecyclePublication,
  type StreamSessions,
} from "./record-stream-lifecycle.ts";

const CHANNEL_ID = "9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69";
const at = (time: string) => new Date(`2026-10-15T${time}:00.000Z`);

type Session = SessionState & { readonly channelId: string };

const memorySessions = ({
  channels = { "provider-channel": CHANNEL_ID },
  sessions = [],
  processed = [],
}: {
  channels?: Readonly<Record<string, string>>;
  sessions?: readonly Session[];
  processed?: readonly string[];
} = {}) => {
  const published: StreamLifecyclePublication[] = [];
  const state = { sessions: [...sessions], processed: new Set(processed), published };
  const tx: LifecycleTransaction = {
    alreadyProcessed: async (eventId) => {
      const seen = state.processed.has(eventId);
      state.processed.add(eventId);
      return seen;
    },
    channelOf: async (providerChannelId) => channels[providerChannelId] ?? null,
    openSessionOf: async (channelId) =>
      state.sessions.find((s) => s.channelId === channelId && s.endedAt === null) ?? null,
    sessionByProvider: async (providerSessionId) =>
      state.sessions.find((s) => s.providerSessionId === providerSessionId) ?? null,
    closeSession: async ({ sessionId, endedAt }) => {
      state.sessions = state.sessions.map((s) => (s.id === sessionId ? { ...s, endedAt } : s));
    },
    followingSessionOf: async (channelId, after) =>
      state.sessions
        .filter((s) => s.channelId === channelId && s.startedAt > after)
        .toSorted((a, b) => a.startedAt.getTime() - b.startedAt.getTime())[0] ?? null,
    openSession: async (session) => {
      state.sessions = [...state.sessions, { ...session, endedAt: null }];
    },
    archiveSession: async (session) => {
      state.sessions = [...state.sessions, session];
    },
    publish: async (event) => {
      state.published.push(event);
    },
  };
  const store: StreamSessions = {
    transaction: async (work) => {
      const before = {
        sessions: state.sessions,
        processed: new Set(state.processed),
        published: published.length,
      };
      try {
        return await work(tx);
      } catch (error) {
        state.sessions = before.sessions;
        state.processed = before.processed;
        published.splice(before.published);
        throw error;
      }
    },
  };
  return { state, store };
};

const sequentialIds = () => {
  const counter = { next: 1 };
  return () => `id-${counter.next++}`;
};

const record = (store: StreamSessions) =>
  recordStreamLifecycle({ sessions: store, newId: sequentialIds() });

const makeEvent = (overrides: Partial<ProviderLifecycleEvent> = {}): ProviderLifecycleEvent => ({
  eventId: "event-1",
  kind: "started",
  providerChannelId: "provider-channel",
  providerSessionId: "provider-session-1",
  occurredAt: at("20:00"),
  ...overrides,
});

const openSession = (overrides: Partial<Session> = {}): Session => ({
  id: "session-en-cours",
  channelId: CHANNEL_ID,
  providerSessionId: "provider-session-0",
  startedAt: at("18:00"),
  endedAt: null,
  ...overrides,
});

describe("enregistrement d'un event de cycle de vie du provider", () => {
  it("ouvre une session au démarrage et publie stream.started", async () => {
    const { state, store } = memorySessions();

    expect(await record(store)(makeEvent())).toEqual({ status: "recorded" });
    expect(state.sessions).toEqual([
      {
        id: "id-1",
        channelId: CHANNEL_ID,
        providerSessionId: "provider-session-1",
        startedAt: at("20:00"),
        endedAt: null,
      },
    ]);
    expect(state.published).toEqual([
      {
        outboxEventId: "id-2",
        kind: "started",
        sessionId: "id-1",
        channelId: CHANNEL_ID,
        at: at("20:00"),
      },
    ]);
  });

  it("clôt la session à la fin et publie stream.ended", async () => {
    const { state, store } = memorySessions({ sessions: [openSession()] });

    await record(store)(
      makeEvent({
        kind: "ended",
        providerSessionId: "provider-session-0",
        occurredAt: at("22:00"),
      }),
    );

    expect(state.sessions).toEqual([openSession({ endedAt: at("22:00") })]);
    expect(state.published).toEqual([
      {
        outboxEventId: "id-1",
        kind: "ended",
        sessionId: "session-en-cours",
        channelId: CHANNEL_ID,
        at: at("22:00"),
      },
    ]);
  });

  it("clôt la session restée ouverte avant d'ouvrir la nouvelle, et publie les deux events", async () => {
    const { state, store } = memorySessions({ sessions: [openSession()] });

    await record(store)(makeEvent());

    expect(state.published).toEqual([
      expect.objectContaining({ kind: "ended", sessionId: "session-en-cours", at: at("20:00") }),
      expect.objectContaining({ kind: "started", sessionId: "id-1", at: at("20:00") }),
    ]);
    expect(state.sessions.filter((s) => s.endedAt === null)).toHaveLength(1);
  });

  it("ne fait rien pour un event déjà traité", async () => {
    const { state, store } = memorySessions({ processed: ["event-1"] });

    expect(await record(store)(makeEvent())).toEqual({ status: "already-processed" });
    expect(state.sessions).toEqual([]);
    expect(state.published).toEqual([]);
  });

  it("n'ouvre qu'une session quand le démarrage est rejoué sous un autre identifiant d'event", async () => {
    const { state, store } = memorySessions();

    await record(store)(makeEvent({ eventId: "event-1" }));
    await record(store)(makeEvent({ eventId: "event-2" }));

    expect(state.sessions).toHaveLength(1);
    expect(state.published).toHaveLength(1);
  });

  it("signale une fin sans effet quand la session est déjà close, sans rien publier", async () => {
    const closed = openSession({ endedAt: at("21:00") });
    const { state, store } = memorySessions({ sessions: [closed] });

    expect(
      await record(store)(
        makeEvent({
          kind: "ended",
          providerSessionId: "provider-session-0",
          occurredAt: at("22:00"),
        }),
      ),
    ).toEqual({ status: "unchanged" });
    expect(state.sessions).toEqual([closed]);
    expect(state.published).toEqual([]);
  });

  it("signale un canal provider inconnu, sans rien écrire", async () => {
    const { state, store } = memorySessions({ channels: {} });

    expect(await record(store)(makeEvent())).toEqual({ status: "unknown-channel" });
    expect(state.sessions).toEqual([]);
    expect(state.published).toEqual([]);
  });

  it("archive close et sans event un démarrage plus ancien que le live en cours", async () => {
    const live = openSession({ startedAt: at("20:00") });
    const { state, store } = memorySessions({ sessions: [live] });

    expect(
      await record(store)(
        makeEvent({ providerSessionId: "provider-ancien", occurredAt: at("19:00") }),
      ),
    ).toEqual({ status: "recorded" });

    expect(state.sessions).toEqual([
      live,
      {
        id: "id-1",
        channelId: CHANNEL_ID,
        providerSessionId: "provider-ancien",
        startedAt: at("19:00"),
        endedAt: at("20:00"),
      },
    ]);
    expect(state.published).toEqual([]);
  });

  it("n'enregistre pas une fin reçue avant son démarrage, pour qu'elle soit réémise", async () => {
    const { state, store } = memorySessions();

    expect(
      await record(store)(makeEvent({ kind: "ended", providerSessionId: "provider-pas-encore" })),
    ).toEqual({ status: "not-yet-started" });
    expect(state.processed.has("event-1")).toBe(false);
    expect(state.sessions).toEqual([]);
    expect(state.published).toEqual([]);
  });

  it("laisse remonter une autre erreur de la transaction", async () => {
    const failure = new Error("base indisponible");
    const store: StreamSessions = { transaction: () => Promise.reject(failure) };

    await expect(record(store)(makeEvent())).rejects.toBe(failure);
  });
});
