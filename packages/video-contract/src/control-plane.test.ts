import { describe, expect, it } from "vitest";

import { CreateChannelRequest, LiveStreams, Problem, StreamKey, VideoChannel } from "./index.ts";

const EXTERNAL_ID = "9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69";
const STARTED_AT = "2026-10-15T20:00:00.000Z";

describe("POST /channels — requête", () => {
  it("décode l'identifiant de la chaîne côté API", () => {
    expect(CreateChannelRequest.parse({ externalId: EXTERNAL_ID })).toEqual({
      externalId: EXTERNAL_ID,
    });
  });

  it.each([
    ["sans identifiant", {}],
    ["avec un identifiant qui n'est pas un UUID", { externalId: "chaine-1" }],
    ["avec un champ inconnu", { externalId: EXTERNAL_ID, name: "x" }],
  ])("refuse une requête %s", (_name, body) => {
    expect(CreateChannelRequest.safeParse(body).success).toBe(false);
  });
});

const makeChannel = (overrides: Record<string, unknown> = {}) => ({
  id: "vch_1",
  externalId: EXTERNAL_ID,
  ...overrides,
});

describe("POST /channels — réponse", () => {
  it("décode le canal vidéo et la chaîne qu'il sert", () => {
    expect(VideoChannel.parse(makeChannel())).toEqual(makeChannel());
  });

  it("garde un champ ajouté plus tard par apps/video", () => {
    expect(VideoChannel.parse(makeChannel({ playbackUrl: "http://h/p.m3u8" }))).toMatchObject({
      playbackUrl: "http://h/p.m3u8",
    });
  });

  it.each([
    ["sans identifiant", { id: undefined }],
    ["avec un identifiant vide", { id: "" }],
    ["sans chaîne", { externalId: undefined }],
    ["avec une chaîne qui n'est pas un UUID", { externalId: "chaine-1" }],
  ])("refuse une réponse %s", (_name, overrides) => {
    expect(VideoChannel.safeParse(makeChannel(overrides)).success).toBe(false);
  });
});

const makeStreamKey = (overrides: Record<string, unknown> = {}) => ({
  streamKey: "sk_live_abc",
  ingestUrl: "rtmp://127.0.0.1:1935/live",
  ...overrides,
});

describe("GET /channels/{id}/stream-key et rotation — réponse", () => {
  it("décode la clé et l'URL d'ingest", () => {
    expect(StreamKey.parse(makeStreamKey())).toEqual(makeStreamKey());
  });

  it("accepte une URL d'ingest rtmps", () => {
    expect(StreamKey.parse(makeStreamKey({ ingestUrl: "rtmps://h:443/live" })).ingestUrl).toBe(
      "rtmps://h:443/live",
    );
  });

  it("garde un champ ajouté plus tard par apps/video", () => {
    expect(StreamKey.parse(makeStreamKey({ createdAt: STARTED_AT }))).toMatchObject({
      createdAt: STARTED_AT,
    });
  });

  it.each([
    ["sans clé", { streamKey: undefined }],
    ["avec une clé vide", { streamKey: "" }],
    ["sans URL d'ingest", { ingestUrl: undefined }],
    ["avec une URL d'ingest http", { ingestUrl: "http://h/live" }],
    ["avec un protocole qui commence par rtmp", { ingestUrl: "rtmpx://h/live" }],
    ["avec un protocole qui finit par rtmp", { ingestUrl: "xrtmp://h/live" }],
    ["avec une URL d'ingest qui n'est pas une URL", { ingestUrl: "pas une url" }],
  ])("refuse une réponse %s", (_name, overrides) => {
    expect(StreamKey.safeParse(makeStreamKey(overrides)).success).toBe(false);
  });
});

const makeLiveStream = (overrides: Record<string, unknown> = {}) => ({
  sessionId: "vss_1",
  channelId: "vch_1",
  startedAt: STARTED_AT,
  ...overrides,
});

describe("GET /streams — réponse", () => {
  it("décode les sessions en direct", () => {
    const body = { streams: [makeLiveStream(), makeLiveStream({ sessionId: "vss_2" })] };

    expect(LiveStreams.parse(body)).toEqual(body);
  });

  it("décode une liste vide", () => {
    expect(LiveStreams.parse({ streams: [] })).toEqual({ streams: [] });
  });

  it("garde les champs ajoutés plus tard par apps/video", () => {
    expect(
      LiveStreams.parse({ streams: [makeLiveStream({ viewers: 3 })], cursor: "c" }),
    ).toMatchObject({ streams: [{ viewers: 3 }], cursor: "c" });
  });

  it.each([
    ["sans session", { sessionId: undefined }],
    ["avec une session vide", { sessionId: "" }],
    ["sans canal", { channelId: undefined }],
    ["avec un canal vide", { channelId: "" }],
    ["sans début", { startedAt: undefined }],
    ["avec un début sans fuseau", { startedAt: "2026-10-15T20:00:00" }],
  ])("refuse une session %s", (_name, overrides) => {
    expect(LiveStreams.safeParse({ streams: [makeLiveStream(overrides)] }).success).toBe(false);
  });

  it("refuse une réponse sans liste", () => {
    expect(LiveStreams.safeParse({}).success).toBe(false);
  });
});

const makeProblem = (overrides: Record<string, unknown> = {}) => ({
  type: "about:blank",
  title: "Requête invalide",
  status: 400,
  ...overrides,
});

describe("Problem — erreur RFC 9457", () => {
  it("décode le type, le titre et le statut", () => {
    expect(Problem.parse(makeProblem())).toEqual(makeProblem());
  });

  it("décode le détail et les erreurs de validation", () => {
    const problem = makeProblem({
      detail: "Le corps est invalide",
      errors: [{ path: "externalId", message: "UUID attendu" }],
    });

    expect(Problem.parse(problem)).toEqual(problem);
  });

  it("garde un champ ajouté plus tard par apps/video", () => {
    expect(Problem.parse(makeProblem({ instance: "/channels" }))).toMatchObject({
      instance: "/channels",
    });
  });

  it.each([100, 599])("accepte le statut limite %i", (status) => {
    expect(Problem.parse(makeProblem({ status })).status).toBe(status);
  });

  it.each([
    ["sans type", { type: undefined }],
    ["sans titre", { title: undefined }],
    ["sans statut", { status: undefined }],
    ["avec un statut 99", { status: 99 }],
    ["avec un statut 600", { status: 600 }],
    ["avec un statut décimal", { status: 400.5 }],
    ["avec un détail qui n'est pas un texte", { detail: 42 }],
    ["avec une erreur sans chemin", { errors: [{ message: "m" }] }],
    ["avec une erreur sans message", { errors: [{ path: "p" }] }],
  ])("refuse un problème %s", (_name, overrides) => {
    expect(Problem.safeParse(makeProblem(overrides)).success).toBe(false);
  });
});
