import type { Part, Segment } from "../segmenter/segmenter.ts";

export const INIT_URI = "init.mp4";
export const MEDIA_URI = "media.m3u8";

export const segmentUri = (sequence: number): string => `${sequence}.m4s`;

export const partUri = (sequence: number, index: number): string => `${sequence}.${index}.m4s`;

const PART_HOLD_BACK_IN_PARTS = 3;
const PARTS_KEPT_IN_TARGET_DURATIONS = 3;

type ListedPart = Pick<Part, "seconds" | "independent">;

export type OpenSegmentParts = { readonly sequence: number; readonly parts: readonly ListedPart[] };

const lines = (...entries: readonly string[]): string => `${entries.join("\n")}\n`;

const partLines = (sequence: number, parts: readonly ListedPart[]): readonly string[] =>
  parts.map(
    ({ seconds, independent }, index) =>
      `#EXT-X-PART:DURATION=${seconds.toFixed(3)},URI="${partUri(sequence, index)}"${independent ? ",INDEPENDENT=YES" : ""}`,
  );

const secondsOf = (parts: readonly ListedPart[]): number =>
  parts.reduce((total, { seconds }) => total + seconds, 0);

const withRecentParts = <S extends Pick<Segment, "seconds">>(
  segments: readonly S[],
  fromEnd: number,
  keptSeconds: number,
): readonly { readonly segment: S; readonly listsParts: boolean }[] =>
  segments.toReversed().reduce<{
    readonly elapsed: number;
    readonly listed: readonly { readonly segment: S; readonly listsParts: boolean }[];
  }>(
    ({ elapsed, listed }, segment) => ({
      elapsed: elapsed + segment.seconds,
      listed: [{ segment, listsParts: elapsed < keptSeconds }, ...listed],
    }),
    { elapsed: fromEnd, listed: [] },
  ).listed;

export const renderMediaPlaylist = ({
  segments,
  open,
  targetDuration,
  partTarget,
  ended,
}: {
  readonly segments: readonly Pick<Segment, "sequence" | "seconds" | "parts">[];
  readonly open: OpenSegmentParts;
  readonly targetDuration: number;
  readonly partTarget: number;
  readonly ended: boolean;
}): string =>
  lines(
    "#EXTM3U",
    "#EXT-X-VERSION:7",
    `#EXT-X-TARGETDURATION:${targetDuration}`,
    `#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=${(partTarget * PART_HOLD_BACK_IN_PARTS).toFixed(3)}`,
    `#EXT-X-PART-INF:PART-TARGET=${partTarget.toFixed(3)}`,
    `#EXT-X-MEDIA-SEQUENCE:${segments[0]?.sequence ?? open.sequence}`,
    "#EXT-X-INDEPENDENT-SEGMENTS",
    `#EXT-X-MAP:URI="${INIT_URI}"`,
    ...withRecentParts(
      segments,
      secondsOf(open.parts),
      targetDuration * PARTS_KEPT_IN_TARGET_DURATIONS,
    ).flatMap(({ segment: { sequence, seconds, parts }, listsParts }) => [
      ...(listsParts && !ended ? partLines(sequence, parts) : []),
      `#EXTINF:${seconds.toFixed(3)},`,
      segmentUri(sequence),
    ]),
    ...(ended
      ? ["#EXT-X-ENDLIST"]
      : [
          ...partLines(open.sequence, open.parts),
          `#EXT-X-PRELOAD-HINT:TYPE=PART,URI="${partUri(open.sequence, open.parts.length)}"`,
        ]),
  );

export const partTargetFor = ({
  previous,
  parts,
}: {
  readonly previous: number;
  readonly parts: readonly Pick<Part, "seconds">[];
}): number => Math.max(previous, ...parts.map(({ seconds }) => Math.ceil(seconds * 1000) / 1000));

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
