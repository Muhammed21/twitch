import { describe, expect, it } from "vitest";

import {
  partTargetFor,
  peakBandwidth,
  renderMasterPlaylist,
  renderMediaPlaylist,
  targetDurationFor,
} from "./playlist.ts";

const makePart = ({
  seconds = 0.5,
  independent = false,
}: { readonly seconds?: number; readonly independent?: boolean } = {}) => ({
  seconds,
  independent,
  bytes: new Uint8Array(1),
});

const makeSegment = ({
  sequence,
  seconds = 2,
  size = 1000,
  parts = [],
}: {
  readonly sequence: number;
  readonly seconds?: number;
  readonly size?: number;
  readonly parts?: readonly ReturnType<typeof makePart>[];
}) => ({ sequence, seconds, bytes: new Uint8Array(size), parts });

const LL_HEADER = [
  "#EXTM3U",
  "#EXT-X-VERSION:7",
  "#EXT-X-TARGETDURATION:2",
  "#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=1.500",
  "#EXT-X-PART-INF:PART-TARGET=0.500",
];

const NOTHING_OPEN = { sequence: 0, parts: [] };

describe("playlist de média", () => {
  it("annonce le segment d'init, la séquence du premier segment et la durée de chacun", () => {
    const segments = [
      makeSegment({ sequence: 4, seconds: 38_831 / 15_360 }),
      makeSegment({ sequence: 5, seconds: 2.4 }),
    ];

    expect(
      renderMediaPlaylist({
        segments,
        open: { sequence: 6, parts: [] },
        targetDuration: 3,
        partTarget: 0.5,
        ended: true,
      }),
    ).toBe(
      [
        "#EXTM3U",
        "#EXT-X-VERSION:7",
        "#EXT-X-TARGETDURATION:3",
        "#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=1.500",
        "#EXT-X-PART-INF:PART-TARGET=0.500",
        "#EXT-X-MEDIA-SEQUENCE:4",
        "#EXT-X-INDEPENDENT-SEGMENTS",
        '#EXT-X-MAP:URI="init.mp4"',
        "#EXTINF:2.528,",
        "4.m4s",
        "#EXTINF:2.400,",
        "5.m4s",
        "#EXT-X-ENDLIST",
        "",
      ].join("\n"),
    );
  });

  it("en direct, liste les parts récentes, celles du segment ouvert, et annonce la part suivante", () => {
    const segments = [
      makeSegment({
        sequence: 7,
        parts: [makePart({ seconds: 1, independent: true }), makePart({ seconds: 1 })],
      }),
    ];
    const open = { sequence: 8, parts: [makePart({ independent: true }), makePart()] };

    expect(
      renderMediaPlaylist({ segments, open, targetDuration: 2, partTarget: 0.5, ended: false }),
    ).toBe(
      [
        ...LL_HEADER,
        "#EXT-X-MEDIA-SEQUENCE:7",
        "#EXT-X-INDEPENDENT-SEGMENTS",
        '#EXT-X-MAP:URI="init.mp4"',
        '#EXT-X-PART:DURATION=1.000,URI="7.0.m4s",INDEPENDENT=YES',
        '#EXT-X-PART:DURATION=1.000,URI="7.1.m4s"',
        "#EXTINF:2.000,",
        "7.m4s",
        '#EXT-X-PART:DURATION=0.500,URI="8.0.m4s",INDEPENDENT=YES',
        '#EXT-X-PART:DURATION=0.500,URI="8.1.m4s"',
        '#EXT-X-PRELOAD-HINT:TYPE=PART,URI="8.2.m4s"',
        "",
      ].join("\n"),
    );
  });

  it("ne liste plus les parts d'un segment fini trois durées cibles ou plus avant la fin", () => {
    const parted = (sequence: number) =>
      makeSegment({ sequence, parts: [makePart({ seconds: 2, independent: true })] });
    const segments = [parted(0), parted(1), parted(2), parted(3)];

    const playlist = renderMediaPlaylist({
      segments,
      open: { sequence: 4, parts: [] },
      targetDuration: 2,
      partTarget: 0.5,
      ended: false,
    });

    expect(playlist).not.toContain('URI="0.0.m4s"');
    expect(playlist).toContain('URI="1.0.m4s"');
    expect(playlist).toContain('URI="2.0.m4s"');
    expect(playlist).toContain('URI="3.0.m4s"');
  });

  it("compte les parts du segment ouvert dans les trois durées cibles", () => {
    const playlist = renderMediaPlaylist({
      segments: [0, 1, 2].map((sequence) =>
        makeSegment({ sequence, parts: [makePart({ seconds: 2, independent: true })] }),
      ),
      open: { sequence: 3, parts: [makePart({ seconds: 2, independent: true })] },
      targetDuration: 2,
      partTarget: 0.5,
      ended: false,
    });

    expect(playlist).not.toContain('URI="0.0.m4s"');
    expect(playlist).toContain('URI="1.0.m4s"');
  });

  it("une fois le live fini, se termine par EXT-X-ENDLIST sans annoncer de part", () => {
    const playlist = renderMediaPlaylist({
      segments: [makeSegment({ sequence: 0, parts: [makePart({ independent: true })] })],
      open: { sequence: 1, parts: [] },
      targetDuration: 2,
      partTarget: 0.5,
      ended: true,
    });

    expect(playlist.endsWith("0.m4s\n#EXT-X-ENDLIST\n")).toBe(true);
    expect(playlist).not.toContain("PRELOAD-HINT");
  });

  it("commence à la séquence du segment ouvert tant qu'aucun segment n'est fermé", () => {
    const playlist = renderMediaPlaylist({
      segments: [],
      open: NOTHING_OPEN,
      targetDuration: 2,
      partTarget: 0.5,
      ended: false,
    });

    expect(playlist).toBe(
      [
        ...LL_HEADER,
        "#EXT-X-MEDIA-SEQUENCE:0",
        "#EXT-X-INDEPENDENT-SEGMENTS",
        '#EXT-X-MAP:URI="init.mp4"',
        '#EXT-X-PRELOAD-HINT:TYPE=PART,URI="0.0.m4s"',
        "",
      ].join("\n"),
    );
  });
});

describe("durée cible des parts", () => {
  it("couvre la part la plus longue, arrondie au millième supérieur, sans jamais redescendre", () => {
    const parts = [makePart({ seconds: 0.3 }), makePart({ seconds: 0.36666 })];

    expect(partTargetFor({ previous: 0.334, parts })).toBe(0.367);
    expect(partTargetFor({ previous: 0.4, parts })).toBe(0.4);
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
    expect(renderMasterPlaylist({ bandwidth: 128_000, mediaUri: "media.m3u8" })).toBe(
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
