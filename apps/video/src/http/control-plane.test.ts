import { randomBytes, randomUUID } from "node:crypto";

import { describe, expect, it, onTestFinished } from "vitest";

import { LiveStreams, Problem, StreamKey, VideoChannel } from "@repo/video-contract";

import { createControlPlane, type VideoStore } from "../control-plane/control-plane.ts";
import { inMemoryVideoStore } from "../control-plane/in-memory-video-store.ts";
import { type IngestSession, publish } from "../domain/ingest.ts";
import { startHttpServer } from "./http-server.ts";

const SERVICE_SECRET = "secret-de-service-de-test-32-car";
const INGEST_URL = "rtmp://ingest.test:1935/live";

const startControlPlane = async ({
  entropy = randomBytes,
  store = inMemoryVideoStore(),
}: {
  entropy?: (size: number) => Uint8Array;
  store?: VideoStore;
} = {}) => {
  const server = await startHttpServer({
    port: 0,
    serviceSecret: SERVICE_SECRET,
    controlPlane: createControlPlane({
      store,
      ingestUrl: INGEST_URL,
      newId: randomUUID,
      randomBytes: entropy,
    }),
  });
  onTestFinished(() => server.close());
  const call = async (
    method: string,
    path: string,
    {
      body,
      authorization = `Bearer ${SERVICE_SECRET}`,
    }: { body?: string | object; authorization?: string | null } = {},
  ) => {
    const response = await fetch(`http://127.0.0.1:${server.port}${path}`, {
      method,
      headers: {
        ...(authorization === null ? {} : { authorization }),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined
        ? {}
        : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    });
    const text = await response.text();
    return {
      status: response.status,
      headers: response.headers,
      body: text === "" ? undefined : (JSON.parse(text) as unknown),
    };
  };
  const createChannel = async (externalId: string = randomUUID()) =>
    VideoChannel.parse((await call("POST", "/channels", { body: { externalId } })).body);
  const streamKeyOf = async (channelId: string) =>
    StreamKey.parse((await call("GET", `/channels/${channelId}/stream-key`)).body).streamKey;
  const seedChannel = async (id: string = randomUUID()) => {
    const channel = { id, externalId: randomUUID(), streamKey: `sk_live_${id}` };
    await store.saveChannel(channel);
    return channel;
  };
  const seedSessions = async (...sessions: readonly IngestSession[]) => {
    await Promise.all(sessions.map((session) => store.saveSession(session)));
  };
  return { store, call, createChannel, streamKeyOf, seedChannel, seedSessions };
};

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

const LIVE_STATE = { state: "live", startedAt: minutesAgo(5) } as const;
const ENDED_STATE = { state: "ended", startedAt: minutesAgo(60), endedAt: minutesAgo(30) } as const;
const IDLE_STATE = { state: "idle" } as const;

const makeSession = (
  channelId: string,
  state: typeof LIVE_STATE | typeof ENDED_STATE | typeof IDLE_STATE,
): IngestSession => ({ id: randomUUID(), channelId, ...state });

describe("authentification du plan de contrôle", () => {
  it.each([
    ["sans en-tête Authorization", null],
    ["avec un mauvais secret de même longueur", `Bearer ${"x".repeat(SERVICE_SECRET.length)}`],
    ["avec un secret plus court", `Bearer ${SERVICE_SECRET.slice(1)}`],
    ["avec un secret plus long", `Bearer ${SERVICE_SECRET}x`],
    ["avec un autre schéma", `Basic ${SERVICE_SECRET}`],
    ["avec un Bearer vide", "Bearer "],
    ["avec Bearer précédé d'un autre texte", `Token Bearer ${SERVICE_SECRET}`],
  ])("refuse un appel %s : 401 en RFC 9457", async (_label, authorization) => {
    const { call } = await startControlPlane();

    const response = await call("GET", "/streams", { authorization });

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(Problem.parse(response.body)).toEqual({
      type: "about:blank",
      title: "Authentification requise",
      status: 401,
    });
  });

  it("refuse sans secret avant de lire le corps", async () => {
    const { call } = await startControlPlane();

    const response = await call("POST", "/channels", { body: "pas du json", authorization: null });

    expect(response.status).toBe(401);
  });

  it("laisse les sondes de santé sans authentification", async () => {
    const { call } = await startControlPlane();

    const response = await call("GET", "/health/live", { authorization: null });

    expect(response.status).toBe(200);
  });
});

describe("POST /channels", () => {
  it("crée un canal pour une chaîne de l'API : 201", async () => {
    const { call } = await startControlPlane();
    const externalId = randomUUID();

    const response = await call("POST", "/channels", { body: { externalId } });

    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(VideoChannel.parse(response.body)).toEqual({ id: expect.any(String), externalId });
  });

  it("rend le même canal à une création rejouée pour la même chaîne : 200", async () => {
    const { call } = await startControlPlane();
    const externalId = randomUUID();
    const first = await call("POST", "/channels", { body: { externalId } });

    const replay = await call("POST", "/channels", { body: { externalId } });

    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(first.body);
  });

  it("crée deux canaux distincts pour deux chaînes", async () => {
    const { createChannel } = await startControlPlane();

    const [first, second] = [await createChannel(), await createChannel()];

    expect(first.id).not.toBe(second.id);
  });

  it.each([
    ["un externalId qui n'est pas un UUID", { externalId: "chaine-42" }, "externalId"],
    ["un externalId absent", {}, "externalId"],
    ["un champ inconnu", { externalId: randomUUID(), extra: true }, ""],
  ])("refuse %s : 400 avec le chemin fautif", async (_label, body, path) => {
    const { call } = await startControlPlane();

    const response = await call("POST", "/channels", { body });

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(Problem.parse(response.body)).toEqual({
      type: "about:blank",
      title: "Requête invalide",
      status: 400,
      errors: [{ path, message: expect.any(String) }],
    });
  });

  it("refuse un corps qui n'est pas du JSON : 400", async () => {
    const { call } = await startControlPlane();

    const response = await call("POST", "/channels", { body: "{pas du json" });

    expect(response.status).toBe(400);
    expect(Problem.parse(response.body)).toEqual({
      type: "about:blank",
      title: "Requête invalide",
      status: 400,
    });
  });

  it("refuse un corps de plus de 16 Kio : 413", async () => {
    const { call } = await startControlPlane();

    const response = await call("POST", "/channels", {
      body: { externalId: randomUUID(), padding: "x".repeat(16 * 1024) },
    });

    expect(response.status).toBe(413);
    expect(Problem.parse(response.body)).toEqual({
      type: "about:blank",
      title: "Corps de requête trop volumineux",
      status: 413,
    });
  });

  it("lit un corps d'exactement 16 Kio", async () => {
    const { call } = await startControlPlane();
    const skeleton = JSON.stringify({ externalId: randomUUID(), padding: "" });
    const body = JSON.stringify({
      externalId: randomUUID(),
      padding: "x".repeat(16 * 1024 - skeleton.length),
    });

    const response = await call("POST", "/channels", { body });

    expect(body).toHaveLength(16 * 1024);
    expect(response.status).toBe(400);
  });

  it("répond 500 sans créer de canal si l'aléa de la clé est défaillant", async () => {
    const { call, store } = await startControlPlane({ entropy: BROKEN_ENTROPY });
    const externalId = randomUUID();

    const response = await call("POST", "/channels", { body: { externalId } });

    expect(response.status).toBe(500);
    expect(Problem.parse(response.body)).toEqual({
      type: "about:blank",
      title: "Erreur interne",
      status: 500,
    });
    expect(await store.findChannelByExternalId(externalId)).toBeUndefined();
  });
});

describe("GET /channels/{id}/stream-key", () => {
  it("rend la clé de 256 bits du canal et l'URL d'ingest", async () => {
    const { call, createChannel } = await startControlPlane();
    const channel = await createChannel();

    const response = await call("GET", `/channels/${channel.id}/stream-key`);

    expect(response.status).toBe(200);
    expect(StreamKey.parse(response.body)).toEqual({
      streamKey: expect.stringMatching(/^sk_live_[0-9a-f]{64}$/),
      ingestUrl: INGEST_URL,
    });
  });

  it("répond 404 pour un canal inconnu", async () => {
    const { call } = await startControlPlane();

    const response = await call("GET", `/channels/${randomUUID()}/stream-key`);

    expect(response.status).toBe(404);
    expect(Problem.parse(response.body)).toEqual({
      type: "about:blank",
      title: "Ressource introuvable",
      status: 404,
    });
  });
});

describe("POST /channels/{id}/stream-key/rotate", () => {
  it("remplace la clé du canal et rend la nouvelle", async () => {
    const { call, createChannel, streamKeyOf } = await startControlPlane();
    const channel = await createChannel();
    const oldKey = await streamKeyOf(channel.id);

    const response = await call("POST", `/channels/${channel.id}/stream-key/rotate`);

    const rotated = StreamKey.parse(response.body);
    expect(response.status).toBe(200);
    expect(rotated).toEqual({
      streamKey: expect.stringMatching(/^sk_live_/),
      ingestUrl: INGEST_URL,
    });
    expect(rotated.streamKey).not.toBe(oldKey);
    expect(await streamKeyOf(channel.id)).toBe(rotated.streamKey);
  });

  it("rend l'ancienne clé inutilisable pour publier, et la nouvelle utilisable", async () => {
    const { call, createChannel, store, streamKeyOf } = await startControlPlane();
    const { id } = await createChannel();
    const oldKey = await streamKeyOf(id);
    await call("POST", `/channels/${id}/stream-key/rotate`);
    const newKey = await streamKeyOf(id);
    const channel = await store.findChannel(id);
    if (channel === undefined) {
      throw new Error("canal introuvable");
    }
    const attempt = (presentedKey: string) =>
      publish({
        channel,
        presentedKey,
        session: makeSession(id, IDLE_STATE),
        channelSessions: [],
        now: new Date(),
      });

    expect(attempt(oldKey)).toEqual({ ok: false, error: "invalid_key" });
    expect(attempt(newKey)).toMatchObject({ ok: true });
  });

  it("ne touche pas à la clé des autres canaux", async () => {
    const { call, createChannel, streamKeyOf } = await startControlPlane();
    const rotated = await createChannel();
    const other = await createChannel();
    const otherKey = await streamKeyOf(other.id);

    await call("POST", `/channels/${rotated.id}/stream-key/rotate`);

    expect(await streamKeyOf(other.id)).toBe(otherKey);
  });

  it("répond 404 pour un canal inconnu", async () => {
    const { call } = await startControlPlane();

    const response = await call("POST", `/channels/${randomUUID()}/stream-key/rotate`);

    expect(response.status).toBe(404);
  });
});

describe("POST /channels/{id}/stream-key/rotate, aléa défaillant", () => {
  it("répond 500 et garde l'ancienne clé", async () => {
    const { call, seedChannel, streamKeyOf } = await startControlPlane({
      entropy: BROKEN_ENTROPY,
    });
    const channel = await seedChannel();

    const response = await call("POST", `/channels/${channel.id}/stream-key/rotate`);

    expect(response.status).toBe(500);
    expect(Problem.parse(response.body)).toMatchObject({ title: "Erreur interne" });
    expect(await streamKeyOf(channel.id)).toBe(channel.streamKey);
  });
});

describe("POST /channels/{id}/stop", () => {
  it("termine le live du canal : 204, puis il n'est plus listé", async () => {
    const { call, store, seedChannel, seedSessions } = await startControlPlane();
    const { id: channelId } = await seedChannel();
    await seedSessions(makeSession(channelId, LIVE_STATE));

    const response = await call("POST", `/channels/${channelId}/stop`);
    const streams = await call("GET", "/streams");

    expect(response.status).toBe(204);
    expect(response.body).toBeUndefined();
    expect(LiveStreams.parse(streams.body).streams).toEqual([]);
    expect(await store.liveSessions()).toEqual([]);
  });

  it("ne termine que le live du canal visé", async () => {
    const { call, seedChannel, seedSessions } = await startControlPlane();
    const stopped = await seedChannel();
    const other = await seedChannel();
    const otherLive = makeSession(other.id, LIVE_STATE);
    await seedSessions(otherLive, makeSession(stopped.id, LIVE_STATE));

    await call("POST", `/channels/${stopped.id}/stop`);
    const streams = await call("GET", "/streams");

    expect(LiveStreams.parse(streams.body).streams).toEqual([
      expect.objectContaining({ sessionId: otherLive.id, channelId: other.id }),
    ]);
  });

  it("répond 409 quand le canal n'a pas de live en cours", async () => {
    const { call, createChannel } = await startControlPlane();
    const channel = await createChannel();

    const response = await call("POST", `/channels/${channel.id}/stop`);

    expect(response.status).toBe(409);
    expect(Problem.parse(response.body)).toEqual({
      type: "about:blank",
      title: "Aucun live en cours",
      status: 409,
    });
  });

  it("répond 404 pour un canal inconnu", async () => {
    const { call } = await startControlPlane();

    const response = await call("POST", `/channels/${randomUUID()}/stop`);

    expect(response.status).toBe(404);
  });
});

describe("GET /streams", () => {
  it("ne liste que les sessions live", async () => {
    const channelId = randomUUID();
    const live = makeSession(channelId, LIVE_STATE);
    const { call, seedSessions } = await startControlPlane();
    await seedSessions(
      makeSession(channelId, IDLE_STATE),
      live,
      makeSession(channelId, ENDED_STATE),
    );

    const response = await call("GET", "/streams");

    expect(response.status).toBe(200);
    expect(LiveStreams.parse(response.body)).toEqual({
      streams: [{ sessionId: live.id, channelId, startedAt: LIVE_STATE.startedAt.toISOString() }],
    });
  });

  it("rend une liste vide sans live", async () => {
    const { call } = await startControlPlane();

    const response = await call("GET", "/streams");

    expect(response.body).toEqual({ streams: [] });
  });
});

const BROKEN_ENTROPY = () => new Uint8Array(4);

const failing = (): Promise<never> => Promise.reject(new Error("base injoignable"));

describe("panne du dépôt", () => {
  it("répond 500 en RFC 9457 sans arrêter le service", async () => {
    const { call } = await startControlPlane({
      store: {
        findChannel: failing,
        findChannelByExternalId: failing,
        saveChannel: failing,
        liveSessions: failing,
        saveSession: failing,
      },
    });

    const response = await call("GET", "/streams");
    const live = await call("GET", "/health/live");

    expect(response.status).toBe(500);
    expect(Problem.parse(response.body)).toEqual({
      type: "about:blank",
      title: "Erreur interne",
      status: 500,
    });
    expect(live.status).toBe(200);
  });
});

describe("routes du plan de contrôle inconnues", () => {
  it.each([
    ["GET", "/channels"],
    ["DELETE", `/channels/${randomUUID()}`],
    ["GET", `/channels/${randomUUID()}/stop`],
    ["POST", `/channels/${randomUUID()}/stream-key`],
    ["POST", "/streams"],
    ["POST", "/v1/channels"],
    ["GET", "/v1/streams"],
    ["GET", "/streams/live"],
  ])("%s %s répond 404", async (method, path) => {
    const { call } = await startControlPlane();

    const response = await call(method, path);

    expect(response.status).toBe(404);
  });
});
