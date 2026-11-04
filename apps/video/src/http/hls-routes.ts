import {
  type BlockingRequest,
  blockingRequestOf,
  isTooFarAhead,
  partOf,
  type PartsView,
  satisfies,
} from "../hls/blocking.ts";
import { type HlsStream, openSegmentOf } from "../hls/hls-stream.ts";
import {
  INIT_URI,
  MEDIA_URI,
  peakBandwidth,
  renderMasterPlaylist,
  renderMediaPlaylist,
} from "../hls/playlist.ts";
import type { Thumbnail } from "../hls/thumbnails.ts";

export type HlsPlayback = {
  readonly find: (sessionId: string) => HlsStream | undefined;
  readonly waitFor: (
    sessionId: string,
    ready: (stream: HlsStream) => boolean,
    timeoutMs: number,
  ) => Promise<HlsStream | undefined>;
  readonly blockingTimeoutMs: number;
  readonly liveSessionOf: (channelId: string) => Promise<string | undefined>;
  readonly fallbackBandwidth: number;
  readonly thumbnailOf: (sessionId: string, stream: HlsStream) => Promise<Thumbnail>;
};

export type HlsReply = {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string | Uint8Array;
};

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const CHANNEL_PATH = new RegExp(`^/hls/channels/(${UUID})/(master\\.m3u8|thumbnail\\.jpg)$`);
const HLS_PATH = new RegExp(`^/hls/(${UUID})/([^/]+)$`);
const SEGMENT_FILE = /^(\d{1,15})\.m4s$/;
const PART_FILE = /^(\d{1,15})\.(\d{1,6})\.m4s$/;

const PLAYLIST_HEADERS = {
  "content-type": "application/vnd.apple.mpegurl",
  "cache-control": "max-age=1",
};

const MEDIA_HEADERS = {
  "content-type": "video/mp4",
  "cache-control": "public, max-age=31536000, immutable",
};

const problem = (status: number, title: string): HlsReply => ({
  status,
  headers: { "content-type": "application/problem+json" },
  body: JSON.stringify({ type: "about:blank", title, status }),
});

const NOT_FOUND = problem(404, "Ressource introuvable");
const BAD_BLOCKING_REQUEST = problem(400, "Rechargement bloquant invalide");
const NOT_YET_AVAILABLE = problem(503, "Segment pas encore disponible");
const THUMBNAIL_UNAVAILABLE = problem(503, "Vignette indisponible");

const THUMBNAIL_HEADERS = { "content-type": "image/jpeg", "cache-control": "public, max-age=30" };

const OPEN_PART_HEADERS = { "content-type": "video/mp4", "cache-control": "no-cache" };

const media = (bytes: Uint8Array | undefined): HlsReply =>
  bytes === undefined ? NOT_FOUND : { status: 200, headers: MEDIA_HEADERS, body: bytes };

const partReply = (view: PartsView, sequence: number, index: number): HlsReply => {
  const found = partOf(view, sequence, index);
  if (found === undefined) {
    return NOT_FOUND;
  }
  return sequence === view.open.sequence
    ? { status: 200, headers: OPEN_PART_HEADERS, body: found.bytes }
    : media(found.bytes);
};

const viewOf = (stream: HlsStream): PartsView => ({
  segments: stream.segments,
  open: openSegmentOf(stream),
});

const masterOf = (stream: HlsStream, mediaUri: string, fallbackBandwidth: number): HlsReply => {
  const bandwidth = peakBandwidth({ segments: stream.segments, fallback: fallbackBandwidth });
  return {
    status: 200,
    headers: PLAYLIST_HEADERS,
    body: renderMasterPlaylist({ bandwidth, mediaUri }),
  };
};

const mediaPlaylistOf = (stream: HlsStream): HlsReply => ({
  status: 200,
  headers: PLAYLIST_HEADERS,
  body: renderMediaPlaylist({ ...stream, open: openSegmentOf(stream) }),
});

const blockingPlaylist = async (
  playback: HlsPlayback,
  sessionId: string,
  stream: HlsStream,
  request: BlockingRequest,
): Promise<HlsReply> => {
  if (isTooFarAhead(viewOf(stream), request)) {
    return BAD_BLOCKING_REQUEST;
  }
  const ready = await playback.waitFor(
    sessionId,
    (next) => satisfies(viewOf(next), request),
    playback.blockingTimeoutMs,
  );
  if (ready !== undefined) {
    return mediaPlaylistOf(ready);
  }
  return playback.find(sessionId) === undefined ? NOT_FOUND : NOT_YET_AVAILABLE;
};

const mediaPlaylist = async (
  playback: HlsPlayback,
  sessionId: string,
  stream: HlsStream,
  query: URLSearchParams,
): Promise<HlsReply> => {
  const request = blockingRequestOf(query);
  if (!request.ok) {
    return BAD_BLOCKING_REQUEST;
  }
  return request.value === undefined
    ? mediaPlaylistOf(stream)
    : await blockingPlaylist(playback, sessionId, stream, request.value);
};

const part = async (
  playback: HlsPlayback,
  sessionId: string,
  stream: HlsStream,
  [sequence, index]: readonly [number, number],
): Promise<HlsReply> => {
  const view = viewOf(stream);
  const hinted = sequence === view.open.sequence && index === view.open.parts.length;
  if (!hinted) {
    return partReply(view, sequence, index);
  }
  const ready = await playback.waitFor(
    sessionId,
    (next) =>
      partOf(viewOf(next), sequence, index) !== undefined || next.segmenter.nextSequence > sequence,
    playback.blockingTimeoutMs,
  );
  return ready === undefined ? NOT_FOUND : partReply(viewOf(ready), sequence, index);
};

const fileOf = async (
  playback: HlsPlayback,
  sessionId: string,
  stream: HlsStream,
  file: string,
  query: URLSearchParams,
): Promise<HlsReply> => {
  if (file === "master.m3u8") {
    return masterOf(stream, MEDIA_URI, playback.fallbackBandwidth);
  }
  if (file === MEDIA_URI) {
    return await mediaPlaylist(playback, sessionId, stream, query);
  }
  if (file === INIT_URI) {
    return media(stream.init?.bytes);
  }
  const partFile = PART_FILE.exec(file);
  if (partFile !== null) {
    return await part(playback, sessionId, stream, [Number(partFile[1]), Number(partFile[2])]);
  }
  const sequence = SEGMENT_FILE.exec(file)?.[1];
  return media(stream.segments.find((segment) => String(segment.sequence) === sequence)?.bytes);
};

const thumbnailReply = (thumbnail: Thumbnail): HlsReply => {
  if (thumbnail.ok) {
    return { status: 200, headers: THUMBNAIL_HEADERS, body: thumbnail.value };
  }
  return thumbnail.error === "failed" ? THUMBNAIL_UNAVAILABLE : NOT_FOUND;
};

const channelFile = async (
  playback: HlsPlayback,
  channelId: string,
  file: string,
): Promise<HlsReply> => {
  const sessionId = await playback.liveSessionOf(channelId);
  if (sessionId === undefined) {
    return NOT_FOUND;
  }
  const stream = playback.find(sessionId);
  if (stream === undefined) {
    return NOT_FOUND;
  }
  return file === "master.m3u8"
    ? masterOf(stream, `/hls/${sessionId}/${MEDIA_URI}`, playback.fallbackBandwidth)
    : thumbnailReply(await playback.thumbnailOf(sessionId, stream));
};

export const routeHls = async ({
  playback,
  pathname,
  query,
}: {
  readonly playback: HlsPlayback;
  readonly pathname: string;
  readonly query: URLSearchParams;
}): Promise<HlsReply> => {
  const channel = CHANNEL_PATH.exec(pathname);
  if (channel !== null) {
    return await channelFile(playback, String(channel[1]), String(channel[2]));
  }
  const match = HLS_PATH.exec(pathname);
  if (match === null) {
    return NOT_FOUND;
  }
  const sessionId = String(match[1]);
  const stream = playback.find(sessionId);
  return stream === undefined
    ? NOT_FOUND
    : await fileOf(playback, sessionId, stream, String(match[2]), query);
};
