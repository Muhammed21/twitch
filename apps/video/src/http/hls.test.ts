import { randomBytes, randomUUID } from "node:crypto";

import { describe, expect, it, onTestFinished } from "vitest";

import { createControlPlane } from "../control-plane/control-plane.ts";
import { inMemoryVideoStore } from "../control-plane/in-memory-video-store.ts";
import { createHlsRegistry } from "../hls/hls-registry.ts";
import {
  FFMPEG_FRAGMENTED_MP4,
  makeFragment,
  makeInit,
} from "../segmenter/testing/fmp4-fixtures.ts";
import { startHttpServer } from "./http-server.ts";

const SESSION_ID = "0b6b8e8e-3c39-4c4f-9a8e-2f1f7f6a9d10";
const HLS_OPTIONS = {
  maxBoxSize: 1 << 20,
  targetSeconds: 2,
  targetDuration: 4,
  capacity: 6,
  maxSegmentBytes: 1 << 20,
};
const FALLBACK_BANDWIDTH = 2_000_000;

const startPlayback = async ({
  liveSessionOf,
}: {
  readonly liveSessionOf?: (channelId: string) => Promise<string | undefined>;
} = {}) => {
  const registry = createHlsRegistry(HLS_OPTIONS);
  const liveSessions = new Map<string, string>();
  const server = await startHttpServer({
    port: 0,
    serviceSecret: "s".repeat(32),
    controlPlane: createControlPlane({
      store: inMemoryVideoStore(),
      ingestUrl: "rtmp://127.0.0.1:1935/live",
      newId: randomUUID,
      randomBytes,
    }),
    hls: {
      find: registry.find,
      liveSessionOf: liveSessionOf ?? (async (channelId) => liveSessions.get(channelId)),
      fallbackBandwidth: FALLBACK_BANDWIDTH,
    },
  });
  onTestFinished(() => server.close());
  const get = (path: string, method = "GET") =>
    fetch(`http://127.0.0.1:${server.port}/hls/${path}`, { method });
  return { registry, liveSessions, get };
};

const PLAYLIST_HEADERS = {
  "content-type": "application/vnd.apple.mpegurl",
  "cache-control": "max-age=1",
};

const MEDIA_HEADERS = {
  "content-type": "video/mp4",
  "cache-control": "public, max-age=31536000, immutable",
};

const headersOf = (response: Response, names: readonly string[]) =>
  Object.fromEntries(names.map((name) => [name, response.headers.get(name)]));

describe("playlist maître d'un canal", () => {
  const CHANNEL_ID = "5f0c2a4e-8d1b-4b7a-9c3e-6a2d1f0e9b87";

  it("pointe la playlist de média de la session en direct du canal", async () => {
    const { registry, liveSessions, get } = await startPlayback();
    liveSessions.set(CHANNEL_ID, SESSION_ID);
    registry.open(SESSION_ID);

    const response = await get(`channels/${CHANNEL_ID}/master.m3u8`);

    expect(headersOf(response, Object.keys(PLAYLIST_HEADERS))).toEqual(PLAYLIST_HEADERS);
    expect(await response.text()).toBe(
      [
        "#EXTM3U",
        "#EXT-X-VERSION:7",
        "#EXT-X-INDEPENDENT-SEGMENTS",
        `#EXT-X-STREAM-INF:BANDWIDTH=${FALLBACK_BANDWIDTH}`,
        `/hls/${SESSION_ID}/media.m3u8`,
        "",
      ].join("\n"),
    );
  });

  it("répond 404 pour la playlist maître d'un canal hors direct", async () => {
    const { registry, get } = await startPlayback();
    registry.open(SESSION_ID);

    expect((await get(`channels/${CHANNEL_ID}/master.m3u8`)).status).toBe(404);
  });

  it("répond 404 tant que ffmpeg n'a rien rendu pour la session en direct du canal", async () => {
    const { liveSessions, get } = await startPlayback();
    liveSessions.set(CHANNEL_ID, SESSION_ID);

    expect((await get(`channels/${CHANNEL_ID}/master.m3u8`)).status).toBe(404);
  });

  it("répond 500 en RFC 9457 quand la session en direct du canal est illisible", async () => {
    const { get } = await startPlayback({
      liveSessionOf: () => Promise.reject(new Error("base injoignable")),
    });

    const response = await get(`channels/${CHANNEL_ID}/master.m3u8`);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      type: "about:blank",
      title: "Erreur interne",
      status: 500,
    });
  });

  it.each([
    ["un identifiant de canal invalide", "channels/pas-un-uuid/master.m3u8"],
    ["une autre playlist que la maître", `channels/${CHANNEL_ID}/media.m3u8`],
  ])("répond 404 pour %s", async (_, path) => {
    const { registry, liveSessions, get } = await startPlayback();
    liveSessions.set(CHANNEL_ID, SESSION_ID);
    registry.open(SESSION_ID);

    expect((await get(path)).status).toBe(404);
  });
});

describe("lecture HLS d'une session", () => {
  it("sert la playlist de média des segments fermés, en cache court", async () => {
    const { registry, get } = await startPlayback();
    registry.open(SESSION_ID);
    registry.feed(SESSION_ID, FFMPEG_FRAGMENTED_MP4);

    const response = await get(`${SESSION_ID}/media.m3u8`);

    expect(response.status).toBe(200);
    expect(headersOf(response, Object.keys(PLAYLIST_HEADERS))).toEqual(PLAYLIST_HEADERS);
    expect(await response.text()).toBe(
      [
        "#EXTM3U",
        "#EXT-X-VERSION:7",
        "#EXT-X-TARGETDURATION:4",
        "#EXT-X-MEDIA-SEQUENCE:0",
        "#EXT-X-INDEPENDENT-SEGMENTS",
        '#EXT-X-MAP:URI="init.mp4"',
        "#EXTINF:2.528,",
        "0.m4s",
        "#EXTINF:2.400,",
        "1.m4s",
        "",
      ].join("\n"),
    );
  });

  it("clôt la playlist de média d'un live terminé", async () => {
    const { registry, get } = await startPlayback();
    registry.open(SESSION_ID);
    registry.feed(SESSION_ID, FFMPEG_FRAGMENTED_MP4);
    registry.end(SESSION_ID);

    const playlist = await (await get(`${SESSION_ID}/media.m3u8`)).text();

    expect(playlist.endsWith("2.m4s\n#EXT-X-ENDLIST\n")).toBe(true);
  });

  it("sert la playlist maître au débit de crête des segments", async () => {
    const { registry, get } = await startPlayback();
    registry.open(SESSION_ID);
    registry.feed(SESSION_ID, FFMPEG_FRAGMENTED_MP4);
    const peak = Math.max(
      ...(registry.find(SESSION_ID)?.segments ?? []).map((segment) =>
        Math.ceil((segment.bytes.length * 8) / segment.seconds),
      ),
    );

    const response = await get(`${SESSION_ID}/master.m3u8`);

    expect(headersOf(response, Object.keys(PLAYLIST_HEADERS))).toEqual(PLAYLIST_HEADERS);
    expect(await response.text()).toContain(`#EXT-X-STREAM-INF:BANDWIDTH=${peak}\nmedia.m3u8\n`);
  });

  it("annonce le débit par défaut avant le premier segment", async () => {
    const { registry, get } = await startPlayback();
    registry.open(SESSION_ID);

    const master = await (await get(`${SESSION_ID}/master.m3u8`)).text();

    expect(master).toContain(`BANDWIDTH=${FALLBACK_BANDWIDTH}\n`);
  });

  it("sert le segment d'init et chaque segment du tampon, immuables", async () => {
    const { registry, get } = await startPlayback();
    registry.open(SESSION_ID);
    registry.feed(SESSION_ID, FFMPEG_FRAGMENTED_MP4);
    const stream = registry.find(SESSION_ID);

    const init = await get(`${SESSION_ID}/init.mp4`);
    const segment = await get(`${SESSION_ID}/1.m4s`);

    expect(headersOf(init, Object.keys(MEDIA_HEADERS))).toEqual(MEDIA_HEADERS);
    expect(new Uint8Array(await init.arrayBuffer())).toEqual(stream?.init?.bytes);
    expect(headersOf(segment, Object.keys(MEDIA_HEADERS))).toEqual(MEDIA_HEADERS);
    expect(new Uint8Array(await segment.arrayBuffer())).toEqual(stream?.segments[1]?.bytes);
  });

  it("répond 404 pour un segment évincé du tampon", async () => {
    const { registry, get } = await startPlayback();
    registry.open(SESSION_ID);
    const init = makeInit({ tracks: [{ id: 1, handler: "vide", timescale: 1000 }] });
    registry.feed(SESSION_ID, init);
    Array.from({ length: 13 }, (_, index) =>
      registry.feed(
        SESSION_ID,
        makeFragment({
          trackId: 1,
          decodeTime: index * 2000,
          defaultFlags: 0x0200_0000,
          samples: [{ duration: 2000 }],
        }),
      ),
    );

    const evicted = await get(`${SESSION_ID}/0.m4s`);
    const kept = await get(`${SESSION_ID}/10.m4s`);

    expect(evicted.status).toBe(404);
    expect(evicted.headers.get("content-type")).toBe("application/problem+json");
    expect(await evicted.json()).toEqual({
      type: "about:blank",
      title: "Ressource introuvable",
      status: 404,
    });
    expect(kept.status).toBe(200);
  });

  it.each([
    ["préfixé", "x0.m4s"],
    ["suffixé", "0.m4sx"],
    ["à zéro de tête", "00.m4s"],
    ["suivi d'un chemin", "media.m3u8/0.m4s"],
    ["imbriqué dans un autre chemin HLS", `${SESSION_ID}/hls/${SESSION_ID}/0.m4s`],
  ])("répond 404 pour un nom de fichier %s", async (_, file) => {
    const { registry, get } = await startPlayback();
    registry.open(SESSION_ID);
    registry.feed(SESSION_ID, FFMPEG_FRAGMENTED_MP4);

    expect((await get(`${SESSION_ID}/0.m4s`)).status).toBe(200);
    expect((await get(`${SESSION_ID}/${file}`)).status).toBe(404);
  });

  it("ne sert les fichiers HLS qu'en GET", async () => {
    const { registry, get } = await startPlayback();
    registry.open(SESSION_ID);
    registry.feed(SESSION_ID, FFMPEG_FRAGMENTED_MP4);

    expect((await get(`${SESSION_ID}/media.m3u8`, "POST")).status).toBe(404);
  });

  it.each([
    ["une session inconnue", `${randomUUID()}/media.m3u8`],
    ["un segment d'init pas encore reçu", `${SESSION_ID}/init.mp4`],
    ["un segment pas encore fermé", `${SESSION_ID}/0.m4s`],
    ["un identifiant de session invalide", "pas-un-uuid/media.m3u8"],
    ["un fichier inconnu", `${SESSION_ID}/media.mpd`],
  ])("répond 404 pour %s", async (_, path) => {
    const { registry, get } = await startPlayback();
    registry.open(SESSION_ID);

    const response = await get(path);

    expect(response.status).toBe(404);
  });
});
