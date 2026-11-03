import type { HlsStream } from "../hls/hls-stream.ts";
import {
  INIT_URI,
  MEDIA_URI,
  peakBandwidth,
  renderMasterPlaylist,
  renderMediaPlaylist,
} from "../hls/playlist.ts";

export type HlsPlayback = {
  readonly find: (sessionId: string) => HlsStream | undefined;
  readonly liveSessionOf: (channelId: string) => Promise<string | undefined>;
  readonly fallbackBandwidth: number;
};

export type HlsReply = {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string | Uint8Array;
};

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const CHANNEL_MASTER_PATH = new RegExp(`^/hls/channels/(${UUID})/master\\.m3u8$`);
const HLS_PATH = new RegExp(`^/hls/(${UUID})/([^/]+)$`);
const SEGMENT_FILE = /^(\d{1,15})\.m4s$/;

const PLAYLIST_HEADERS = {
  "content-type": "application/vnd.apple.mpegurl",
  "cache-control": "max-age=1",
};

const MEDIA_HEADERS = {
  "content-type": "video/mp4",
  "cache-control": "public, max-age=31536000, immutable",
};

const NOT_FOUND: HlsReply = {
  status: 404,
  headers: { "content-type": "application/problem+json" },
  body: JSON.stringify({ type: "about:blank", title: "Ressource introuvable", status: 404 }),
};

const media = (bytes: Uint8Array | undefined): HlsReply =>
  bytes === undefined ? NOT_FOUND : { status: 200, headers: MEDIA_HEADERS, body: bytes };

const masterOf = (stream: HlsStream, mediaUri: string, fallbackBandwidth: number): HlsReply => {
  const bandwidth = peakBandwidth({ segments: stream.segments, fallback: fallbackBandwidth });
  return {
    status: 200,
    headers: PLAYLIST_HEADERS,
    body: renderMasterPlaylist({ bandwidth, mediaUri }),
  };
};

const fileOf = (stream: HlsStream, file: string, fallbackBandwidth: number): HlsReply => {
  if (file === "master.m3u8") {
    return masterOf(stream, MEDIA_URI, fallbackBandwidth);
  }
  if (file === MEDIA_URI) {
    return { status: 200, headers: PLAYLIST_HEADERS, body: renderMediaPlaylist(stream) };
  }
  if (file === INIT_URI) {
    return media(stream.init?.bytes);
  }
  const sequence = SEGMENT_FILE.exec(file)?.[1];
  return media(stream.segments.find((segment) => String(segment.sequence) === sequence)?.bytes);
};

const channelMaster = async (playback: HlsPlayback, channelId: string): Promise<HlsReply> => {
  const sessionId = await playback.liveSessionOf(channelId);
  if (sessionId === undefined) {
    return NOT_FOUND;
  }
  const stream = playback.find(sessionId);
  return stream === undefined
    ? NOT_FOUND
    : masterOf(stream, `/hls/${sessionId}/${MEDIA_URI}`, playback.fallbackBandwidth);
};

export const routeHls = async ({
  playback,
  pathname,
}: {
  readonly playback: HlsPlayback;
  readonly pathname: string;
}): Promise<HlsReply> => {
  const channel = CHANNEL_MASTER_PATH.exec(pathname);
  if (channel !== null) {
    return await channelMaster(playback, String(channel[1]));
  }
  const match = HLS_PATH.exec(pathname);
  if (match === null) {
    return NOT_FOUND;
  }
  const stream = playback.find(String(match[1]));
  return stream === undefined
    ? NOT_FOUND
    : fileOf(stream, String(match[2]), playback.fallbackBandwidth);
};
