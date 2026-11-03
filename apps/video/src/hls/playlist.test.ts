import { describe, expect, it } from "vitest";

import {
  peakBandwidth,
  renderMasterPlaylist,
  renderMediaPlaylist,
  targetDurationFor,
} from "./playlist.ts";

const makeSegment = ({
  sequence,
  seconds = 2,
  size = 1000,
}: {
  readonly sequence: number;
  readonly seconds?: number;
  readonly size?: number;
}) => ({ sequence, seconds, bytes: new Uint8Array(size) });

describe("playlist de média", () => {
  it("annonce le segment d'init, la séquence du premier segment et la durée de chacun", () => {
    const segments = [
      makeSegment({ sequence: 4, seconds: 38_831 / 15_360 }),
      makeSegment({ sequence: 5, seconds: 2.4 }),
    ];

    expect(renderMediaPlaylist({ segments, targetDuration: 3, ended: false })).toBe(
      [
        "#EXTM3U",
        "#EXT-X-VERSION:7",
        "#EXT-X-TARGETDURATION:3",
        "#EXT-X-MEDIA-SEQUENCE:4",
        "#EXT-X-INDEPENDENT-SEGMENTS",
        '#EXT-X-MAP:URI="init.mp4"',
        "#EXTINF:2.528,",
        "4.m4s",
        "#EXTINF:2.400,",
        "5.m4s",
        "",
      ].join("\n"),
    );
  });

  it("se termine par EXT-X-ENDLIST une fois le live fini", () => {
    const playlist = renderMediaPlaylist({
      segments: [makeSegment({ sequence: 0 })],
      targetDuration: 2,
      ended: true,
    });

    expect(playlist.endsWith("0.m4s\n#EXT-X-ENDLIST\n")).toBe(true);
  });

  it("commence à la séquence 0 tant qu'aucun segment n'est fermé", () => {
    expect(renderMediaPlaylist({ segments: [], targetDuration: 2, ended: false })).toContain(
      "#EXT-X-MEDIA-SEQUENCE:0\n",
    );
  });
});

describe("durée cible", () => {
  it("couvre le segment le plus long arrondi à l'entier le plus proche", () => {
    const segments = [
      makeSegment({ sequence: 0, seconds: 2.4 }),
      makeSegment({ sequence: 1, seconds: 3.5 }),
    ];

    expect(targetDurationFor({ previous: 2, segments })).toBe(4);
  });

  it("ne redescend jamais quand le segment long sort de la fenêtre", () => {
    expect(
      targetDurationFor({ previous: 4, segments: [makeSegment({ sequence: 9, seconds: 2 })] }),
    ).toBe(4);
  });
});

describe("playlist maître", () => {
  it("pointe la playlist de média avec son débit de crête", () => {
    expect(renderMasterPlaylist({ bandwidth: 128_000 })).toBe(
      [
        "#EXTM3U",
        "#EXT-X-VERSION:7",
        "#EXT-X-INDEPENDENT-SEGMENTS",
        "#EXT-X-STREAM-INF:BANDWIDTH=128000",
        "media.m3u8",
        "",
      ].join("\n"),
    );
  });

  it("prend le débit du segment le plus dense, arrondi au bit par seconde supérieur", () => {
    const segments = [
      makeSegment({ sequence: 0, seconds: 2, size: 1000 }),
      makeSegment({ sequence: 1, seconds: 3, size: 2000 }),
    ];

    expect(peakBandwidth({ segments, fallback: 1 })).toBe(5334);
  });

  it("annonce le débit par défaut tant qu'aucun segment n'est fermé", () => {
    expect(peakBandwidth({ segments: [], fallback: 2_000_000 })).toBe(2_000_000);
  });
});
