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
import type { HlsPlayback } from "./hls-routes.ts";
import { startHttpServer } from "./http-server.ts";

const SESSION_ID = "0b6b8e8e-3c39-4c4f-9a8e-2f1f7f6a9d10";
const HLS_OPTIONS = {
  maxBoxSize: 1 << 20,
  targetSeconds: 2,
  targetDuration: 4,
  partTarget: 0.334,
  capacity: 6,
  maxSegmentBytes: 1 << 20,
};
const FALLBACK_BANDWIDTH = 2_000_000;
const BLOCKING_TIMEOUT_MS = 200;

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);

const startPlayback = async ({
  liveSessionOf,
  blockingTimeoutMs = BLOCKING_TIMEOUT_MS,
  thumbnailOf = async () => ({ ok: true, value: JPEG }),
}: {
  readonly liveSessionOf?: (channelId: string) => Promise<string | undefined>;
  readonly blockingTimeoutMs?: number;
  readonly thumbnailOf?: HlsPlayback["thumbnailOf"];
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
      waitFor: registry.waitFor,
      blockingTimeoutMs,
      liveSessionOf: liveSessionOf ?? (async (channelId) => liveSessions.get(channelId)),
      fallbackBandwidth: FALLBACK_BANDWIDTH,
      thumbnailOf,
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

const OPEN_PART_HEADERS = { "content-type": "video/mp4", "cache-control": "no-cache" };

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

describe("vignette d'un canal", () => {
  const CHANNEL_ID = "5f0c2a4e-8d1b-4b7a-9c3e-6a2d1f0e9b87";
  const THUMBNAIL_HEADERS = { "content-type": "image/jpeg", "cache-control": "public, max-age=30" };

  it("sert le JPEG de la session en direct du canal, en cache de 30 s", async () => {
    const asked: string[] = [];
    const { registry, liveSessions, get } = await startPlayback({
      thumbnailOf: async (sessionId, stream) => {
        asked.push(`${sessionId}:${String(stream.ended)}`);
        return { ok: true, value: JPEG };
      },
    });
    liveSessions.set(CHANNEL_ID, SESSION_ID);
    registry.open(SESSION_ID);

    const response = await get(`channels/${CHANNEL_ID}/thumbnail.jpg`);

    expect(response.status).toBe(200);
    expect(headersOf(response, Object.keys(THUMBNAIL_HEADERS))).toEqual(THUMBNAIL_HEADERS);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(JPEG);
    expect(asked).toEqual([`${SESSION_ID}:false`]);
  });

  it("répond 404 pour la vignette d'un canal hors direct", async () => {
    const { registry, get } = await startPlayback();
    registry.open(SESSION_ID);

    expect((await get(`channels/${CHANNEL_ID}/thumbnail.jpg`)).status).toBe(404);
  });

  it("répond 404 tant que ffmpeg n'a rien rendu pour la session en direct du canal", async () => {
    const { liveSessions, get } = await startPlayback();
    liveSessions.set(CHANNEL_ID, SESSION_ID);

    expect((await get(`channels/${CHANNEL_ID}/thumbnail.jpg`)).status).toBe(404);
  });

  it("répond 404 tant qu'aucun segment n'est fermé", async () => {
    const { registry, liveSessions, get } = await startPlayback({
      thumbnailOf: async () => ({ ok: false, error: "not_ready" }),
    });
    liveSessions.set(CHANNEL_ID, SESSION_ID);
    registry.open(SESSION_ID);

    expect((await get(`channels/${CHANNEL_ID}/thumbnail.jpg`)).status).toBe(404);
  });

  it("répond 503 en RFC 9457 quand ffmpeg n'a pas rendu d'image", async () => {
    const { registry, liveSessions, get } = await startPlayback({
      thumbnailOf: async () => ({ ok: false, error: "failed" }),
    });
    liveSessions.set(CHANNEL_ID, SESSION_ID);
    registry.open(SESSION_ID);

    const response = await get(`channels/${CHANNEL_ID}/thumbnail.jpg`);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      type: "about:blank",
      title: "Vignette indisponible",
      status: 503,
    });
  });

  it("répond 404 pour la vignette d'un identifiant de canal invalide", async () => {
    const { registry, liveSessions, get } = await startPlayback();
    liveSessions.set(CHANNEL_ID, SESSION_ID);
    registry.open(SESSION_ID);

    expect((await get("channels/pas-un-uuid/thumbnail.jpg")).status).toBe(404);
  });
});

describe("lecture HLS d'une session", () => {
  it("sert la playlist LL-HLS des segments fermés et des parts du segment ouvert, en cache court", async () => {
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
        "#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=1.287",
        "#EXT-X-PART-INF:PART-TARGET=0.429",
        "#EXT-X-MEDIA-SEQUENCE:0",
        "#EXT-X-INDEPENDENT-SEGMENTS",
        '#EXT-X-MAP:URI="init.mp4"',
        '#EXT-X-PART:DURATION=0.428,URI="0.0.m4s",INDEPENDENT=YES',
        '#EXT-X-PART:DURATION=0.400,URI="0.1.m4s"',
        '#EXT-X-PART:DURATION=0.100,URI="0.2.m4s"',
        '#EXT-X-PART:DURATION=0.400,URI="0.3.m4s",INDEPENDENT=YES',
        '#EXT-X-PART:DURATION=0.400,URI="0.4.m4s"',
        '#EXT-X-PART:DURATION=0.400,URI="0.5.m4s",INDEPENDENT=YES',
        '#EXT-X-PART:DURATION=0.400,URI="0.6.m4s"',
        "#EXTINF:2.528,",
        "0.m4s",
        '#EXT-X-PART:DURATION=0.400,URI="1.0.m4s",INDEPENDENT=YES',
        '#EXT-X-PART:DURATION=0.400,URI="1.1.m4s"',
        '#EXT-X-PART:DURATION=0.400,URI="1.2.m4s",INDEPENDENT=YES',
        '#EXT-X-PART:DURATION=0.400,URI="1.3.m4s"',
        '#EXT-X-PART:DURATION=0.400,URI="1.4.m4s",INDEPENDENT=YES',
        '#EXT-X-PART:DURATION=0.400,URI="1.5.m4s"',
        "#EXTINF:2.400,",
        "1.m4s",
        '#EXT-X-PART:DURATION=0.400,URI="2.0.m4s",INDEPENDENT=YES',
        '#EXT-X-PART:DURATION=0.400,URI="2.1.m4s"',
        '#EXT-X-PART:DURATION=0.400,URI="2.2.m4s",INDEPENDENT=YES',
        '#EXT-X-PART:DURATION=0.400,URI="2.3.m4s"',
        '#EXT-X-PART:DURATION=0.400,URI="2.4.m4s",INDEPENDENT=YES',
        '#EXT-X-PART:DURATION=0.200,URI="2.5.m4s"',
        '#EXT-X-PRELOAD-HINT:TYPE=PART,URI="2.6.m4s"',
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

const VIDEO_TRACK = { id: 1, handler: "vide", timescale: 1000 };

const makeKeyframe = (decodeTime: number, duration: number) =>
  makeFragment({ trackId: 1, decodeTime, defaultFlags: 0x0200_0000, samples: [{ duration }] });

const untilWaiting = async (registry: { readonly waiting: () => number }) => {
  while (registry.waiting() === 0) {
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
  }
};

const LONG_BLOCKING_MS = 30_000;

const makeFollowing = (decodeTime: number, duration: number) =>
  makeFragment({ trackId: 1, decodeTime, defaultFlags: 0x0101_0000, samples: [{ duration }] });

const openWithOnePart = async ({
  firstPartMs = 300,
  blockingTimeoutMs = BLOCKING_TIMEOUT_MS,
}: { readonly firstPartMs?: number; readonly blockingTimeoutMs?: number } = {}) => {
  const playback = await startPlayback({ blockingTimeoutMs });
  playback.registry.open(SESSION_ID);
  playback.registry.feed(SESSION_ID, makeInit({ tracks: [VIDEO_TRACK] }));
  const first = makeKeyframe(0, firstPartMs);
  playback.registry.feed(SESSION_ID, first);
  return { ...playback, first };
};

describe("parts du LL-HLS", () => {
  it("sert une part du segment ouvert sans la laisser en cache : un segment abandonné rend son numéro", async () => {
    const { get, first } = await openWithOnePart();

    const response = await get(`${SESSION_ID}/0.0.m4s`);

    expect(response.status).toBe(200);
    expect(headersOf(response, Object.keys(OPEN_PART_HEADERS))).toEqual(OPEN_PART_HEADERS);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(first);
  });

  it("sert une part d'un segment fermé, immuable", async () => {
    const { registry, get } = await startPlayback();
    registry.open(SESSION_ID);
    registry.feed(SESSION_ID, FFMPEG_FRAGMENTED_MP4);

    const response = await get(`${SESSION_ID}/1.1.m4s`);

    expect(response.status).toBe(200);
    expect(headersOf(response, Object.keys(MEDIA_HEADERS))).toEqual(MEDIA_HEADERS);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      registry.find(SESSION_ID)?.segments[1]?.parts[1]?.bytes,
    );
  });

  it("répond 404 sans attendre pour une part qui n'est pas la prochaine", async () => {
    const { get } = await openWithOnePart({ blockingTimeoutMs: LONG_BLOCKING_MS });

    expect((await get(`${SESSION_ID}/0.2.m4s`)).status).toBe(404);
    expect((await get(`${SESSION_ID}/1.1.m4s`)).status).toBe(404);
    expect((await get(`${SESSION_ID}/7.0.m4s`)).status).toBe(404);
  });

  it.each(["x0.0.m4s", "0.0.m4sx", "0.0.mp4"])("répond 404 pour le fichier %s", async (file) => {
    const { get } = await openWithOnePart();

    expect((await get(`${SESSION_ID}/${file}`)).status).toBe(404);
  });

  it("sert les parts aux numéros à plusieurs chiffres", async () => {
    const { registry, get } = await startPlayback();
    registry.open(SESSION_ID);
    registry.feed(SESSION_ID, makeInit({ tracks: [VIDEO_TRACK] }));
    for (const fragment of Array.from({ length: 11 }, (_, index) =>
      makeKeyframe(index * 2000, 2000),
    )) {
      registry.feed(SESSION_ID, fragment);
    }
    const following = Array.from({ length: 10 }, (_, index) =>
      makeFollowing(22_000 + index * 10, 10),
    );
    for (const fragment of following) {
      registry.feed(SESSION_ID, fragment);
    }

    const response = await get(`${SESSION_ID}/10.10.m4s`);

    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(following[9]);
  });

  it("répond 404 dès que le segment de la part annoncée se ferme sans elle", async () => {
    const { registry, get } = await openWithOnePart({
      firstPartMs: 2000,
      blockingTimeoutMs: LONG_BLOCKING_MS,
    });
    const pending = get(`${SESSION_ID}/0.1.m4s`);

    await untilWaiting(registry);
    registry.feed(SESSION_ID, makeKeyframe(2000, 300));

    expect((await pending).status).toBe(404);
  });

  it("retient la demande de la part annoncée jusqu'à son arrivée", async () => {
    const { registry, get } = await openWithOnePart();
    const pending = get(`${SESSION_ID}/0.1.m4s`);
    const next = makeFollowing(300, 300);

    await untilWaiting(registry);
    registry.feed(SESSION_ID, next);
    const response = await pending;

    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(next);
  });

  it("répond 404 quand la part annoncée n'arrive pas dans le délai", async () => {
    const { get } = await openWithOnePart();

    expect((await get(`${SESSION_ID}/0.1.m4s`)).status).toBe(404);
  });
});

describe("rechargement bloquant de la playlist de média", () => {
  it("répond dès que la part demandée existe", async () => {
    const { registry, get } = await openWithOnePart();
    const pending = get(`${SESSION_ID}/media.m3u8?_HLS_msn=0&_HLS_part=1`);

    await untilWaiting(registry);
    registry.feed(SESSION_ID, makeKeyframe(300, 300));
    const response = await pending;

    expect(response.status).toBe(200);
    expect(headersOf(response, Object.keys(PLAYLIST_HEADERS))).toEqual(PLAYLIST_HEADERS);
    expect(await response.text()).toContain('URI="0.1.m4s"');
  });

  it("répond aussitôt pour une part déjà là", async () => {
    const { get } = await openWithOnePart();

    const response = await get(`${SESSION_ID}/media.m3u8?_HLS_msn=0&_HLS_part=0`);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('URI="0.0.m4s"');
  });

  it("répond 503 quand la part demandée n'arrive pas dans le délai", async () => {
    const { get } = await openWithOnePart();

    const response = await get(`${SESSION_ID}/media.m3u8?_HLS_msn=0&_HLS_part=1`);

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      status: 503,
      title: "Segment pas encore disponible",
    });
  });

  it.each(["_HLS_part=1", "_HLS_msn=x", "_HLS_msn=3"])("répond 400 à %s", async (query) => {
    const { get } = await openWithOnePart();

    const response = await get(`${SESSION_ID}/media.m3u8?${query}`);

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(await response.json()).toMatchObject({
      status: 400,
      title: "Rechargement bloquant invalide",
    });
  });

  it("répond 404 pour une session inconnue", async () => {
    const { get } = await startPlayback();

    expect((await get(`${SESSION_ID}/media.m3u8?_HLS_msn=0`)).status).toBe(404);
  });

  it("répond 404 pour une session retirée pendant l'attente", async () => {
    const { registry, get } = await openWithOnePart({ blockingTimeoutMs: LONG_BLOCKING_MS });
    const pending = get(`${SESSION_ID}/media.m3u8?_HLS_msn=0&_HLS_part=1`);

    await untilWaiting(registry);
    registry.remove(SESSION_ID);

    expect((await pending).status).toBe(404);
  });
});
