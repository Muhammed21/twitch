import { describe, expect, it } from "vitest";

import {
  type IngestSession,
  openSession,
  publish,
  rotateStreamKey,
  stop,
  streamKeyFrom,
  type VideoChannel,
} from "./ingest.ts";

const STARTED_AT = new Date("2026-10-15T20:00:00.000Z");
const ENDED_AT = new Date("2026-10-15T21:30:00.000Z");

const bytes = (fill: number, size = 32) => new Uint8Array(size).fill(fill);

const keyOf = (fill: number): string => `sk_live_${fill.toString(16).padStart(2, "0").repeat(32)}`;

const makeChannel = (overrides: Partial<VideoChannel> = {}): VideoChannel => ({
  id: "canal-1",
  externalId: "chaine-1",
  streamKey: keyOf(1),
  ...overrides,
});

const idleSession = (overrides: Partial<{ id: string; channelId: string }> = {}) =>
  openSession({ id: "session-1", channelId: "canal-1", ...overrides });

const LIVE_ON_CANAL_1: IngestSession = {
  state: "live",
  id: "session-0",
  channelId: "canal-1",
  startedAt: STARTED_AT,
};

const publishOn = ({
  channel = makeChannel(),
  presentedKey = channel.streamKey,
  session = idleSession(),
  channelSessions = [],
}: {
  channel?: VideoChannel;
  presentedKey?: string;
  session?: IngestSession;
  channelSessions?: readonly IngestSession[];
} = {}) => publish({ channel, presentedKey, session, channelSessions, now: STARTED_AT });

describe("clé de stream", () => {
  it("tire 256 bits du générateur et les écrit en hexadécimal derrière sk_live_", () => {
    const asked: number[] = [];

    const key = streamKeyFrom((size) => {
      asked.push(size);
      return Uint8Array.from({ length: size }, (_, index) => index);
    });

    expect(asked).toEqual([32]);
    expect(key).toEqual({
      ok: true,
      value: `sk_live_${Array.from({ length: 32 }, (_, index) => index.toString(16).padStart(2, "0")).join("")}`,
    });
  });

  it.each([31, 33, 0])("refuse un générateur qui rend %i octets au lieu de 32", (size) => {
    expect(streamKeyFrom(() => bytes(7, size))).toEqual({
      ok: false,
      error: "invalid_entropy",
    });
  });
});

describe("rotation de la clé", () => {
  it("remplace la clé du canal : l'ancienne ne publie plus, la nouvelle publie", () => {
    const before = makeChannel();
    const after = rotateStreamKey(before, keyOf(2));

    expect(after).toEqual({ ...before, streamKey: keyOf(2) });
    expect(publishOn({ channel: after, presentedKey: before.streamKey })).toEqual({
      ok: false,
      error: "invalid_key",
    });
    expect(publishOn({ channel: after, presentedKey: keyOf(2) }).ok).toBe(true);
  });
});

describe("machine à états d'une session d'ingest", () => {
  it("ouvre une session au repos", () => {
    expect(idleSession()).toEqual({ state: "idle", id: "session-1", channelId: "canal-1" });
  });

  it("passe en direct quand la clé du canal est présentée", () => {
    expect(publishOn()).toEqual({
      ok: true,
      value: { state: "live", id: "session-1", channelId: "canal-1", startedAt: STARTED_AT },
    });
  });

  it.each([
    ["inconnue", keyOf(9)],
    ["d'une autre longueur", "sk_live_00"],
    ["vide", ""],
  ])("refuse une clé %s", (_name, presentedKey) => {
    expect(publishOn({ presentedKey })).toEqual({ ok: false, error: "invalid_key" });
  });

  it("refuse une session ouverte sur un autre canal que celui de la clé", () => {
    expect(publishOn({ session: idleSession({ channelId: "canal-2" }) })).toEqual({
      ok: false,
      error: "invalid_key",
    });
  });

  it("refuse un second publish sur un canal déjà en direct", () => {
    expect(publishOn({ channelSessions: [LIVE_ON_CANAL_1] })).toEqual({
      ok: false,
      error: "already_live",
    });
  });

  it("accepte un publish quand les sessions du canal sont terminées ou au repos", () => {
    const ended: IngestSession = { ...LIVE_ON_CANAL_1, state: "ended", endedAt: ENDED_AT };

    expect(publishOn({ channelSessions: [ended, idleSession({ id: "session-2" })] }).ok).toBe(true);
  });

  it("vérifie la clé avant l'état du canal, pour ne rien révéler à une clé invalide", () => {
    expect(publishOn({ presentedKey: keyOf(9), channelSessions: [LIVE_ON_CANAL_1] })).toEqual({
      ok: false,
      error: "invalid_key",
    });
  });

  it.each<[string, IngestSession]>([
    ["en direct", LIVE_ON_CANAL_1],
    ["terminée", { ...LIVE_ON_CANAL_1, state: "ended", endedAt: ENDED_AT }],
  ])("refuse de passer en direct une session %s", (_name, session) => {
    expect(publishOn({ session })).toEqual({ ok: false, error: "not_idle" });
  });

  it("termine une session en direct à l'instant donné", () => {
    expect(stop(LIVE_ON_CANAL_1, ENDED_AT)).toEqual({
      ok: true,
      value: { ...LIVE_ON_CANAL_1, state: "ended", endedAt: ENDED_AT },
    });
  });

  it.each<[string, IngestSession]>([
    ["au repos", idleSession()],
    ["déjà terminée", { ...LIVE_ON_CANAL_1, state: "ended", endedAt: ENDED_AT }],
  ])("ne termine pas une session %s", (_name, session) => {
    expect(stop(session, ENDED_AT)).toEqual({ ok: false, error: "not_live" });
  });
});
