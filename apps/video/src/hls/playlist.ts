import type { Segment } from "../segmenter/segmenter.ts";

export const INIT_URI = "init.mp4";
export const MEDIA_URI = "media.m3u8";

export const segmentUri = (sequence: number): string => `${sequence}.m4s`;

const lines = (...entries: readonly string[]): string => `${entries.join("\n")}\n`;

export const renderMediaPlaylist = ({
  segments,
  targetDuration,
  ended,
}: {
  readonly segments: readonly Pick<Segment, "sequence" | "seconds">[];
  readonly targetDuration: number;
  readonly ended: boolean;
}): string =>
  lines(
    "#EXTM3U",
    "#EXT-X-VERSION:7",
    `#EXT-X-TARGETDURATION:${targetDuration}`,
    `#EXT-X-MEDIA-SEQUENCE:${segments[0]?.sequence ?? 0}`,
    "#EXT-X-INDEPENDENT-SEGMENTS",
    `#EXT-X-MAP:URI="${INIT_URI}"`,
    ...segments.flatMap(({ sequence, seconds }) => [
      `#EXTINF:${seconds.toFixed(3)},`,
      segmentUri(sequence),
    ]),
    ...(ended ? ["#EXT-X-ENDLIST"] : []),
  );

export const targetDurationFor = ({
  previous,
  segments,
}: {
  readonly previous: number;
  readonly segments: readonly Pick<Segment, "seconds">[];
}): number => Math.max(previous, ...segments.map(({ seconds }) => Math.round(seconds)));

export const peakBandwidth = ({
  segments,
  fallback,
}: {
  readonly segments: readonly Pick<Segment, "seconds" | "bytes">[];
  readonly fallback: number;
}): number =>
  segments.length === 0
    ? fallback
    : Math.max(...segments.map(({ bytes, seconds }) => Math.ceil((bytes.length * 8) / seconds)));

export const renderMasterPlaylist = ({
  bandwidth,
  mediaUri,
}: {
  readonly bandwidth: number;
  readonly mediaUri: string;
}): string =>
  lines(
    "#EXTM3U",
    "#EXT-X-VERSION:7",
    "#EXT-X-INDEPENDENT-SEGMENTS",
    `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth}`,
    mediaUri,
  );
