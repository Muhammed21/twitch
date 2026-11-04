import { describe, expect, it } from "vitest";

import { getThumbnailUrls } from "./thumbnail-urls.ts";

const CHANNEL_A = "00000000-0000-4000-8000-00000000000a";
const CHANNEL_B = "00000000-0000-4000-8000-00000000000b";
const PROVIDER_A = "5f0c2a4e-8d1b-4b7a-9c3e-6a2d1f0e9b87";

const makeChannels = (links: ReadonlyMap<string, string>) => {
  const reads: (readonly string[])[] = [];
  return {
    reads,
    channels: {
      providerChannelsOf: async (channelIds: readonly string[]) => {
        reads.push(channelIds);
        return new Map([...links].filter(([channelId]) => channelIds.includes(channelId)));
      },
    },
  };
};

describe("URL des vignettes des chaînes", () => {
  it("pointe la vignette du canal vidéo de chaque chaîne, sous l'URL de lecture", async () => {
    const { channels } = makeChannels(new Map([[CHANNEL_A, PROVIDER_A]]));

    const urls = await getThumbnailUrls({ channels, baseUrl: "https://video.example/" })([
      CHANNEL_A,
    ]);

    expect(urls).toEqual(
      new Map([[CHANNEL_A, `https://video.example/hls/channels/${PROVIDER_A}/thumbnail.jpg`]]),
    );
  });

  it("n'a pas d'URL pour une chaîne sans canal vidéo", async () => {
    const { channels } = makeChannels(new Map([[CHANNEL_A, PROVIDER_A]]));

    const urls = await getThumbnailUrls({ channels, baseUrl: "http://127.0.0.1:3002" })([
      CHANNEL_A,
      CHANNEL_B,
    ]);

    expect(urls).toEqual(
      new Map([[CHANNEL_A, `http://127.0.0.1:3002/hls/channels/${PROVIDER_A}/thumbnail.jpg`]]),
    );
  });

  it("lit les canaux de toutes les chaînes en une lecture", async () => {
    const { channels, reads } = makeChannels(new Map());

    await getThumbnailUrls({ channels, baseUrl: "http://127.0.0.1:3002" })([CHANNEL_A, CHANNEL_B]);

    expect(reads).toEqual([[CHANNEL_A, CHANNEL_B]]);
  });

  it("ne lit rien pour une liste vide", async () => {
    const { channels, reads } = makeChannels(new Map());

    expect(await getThumbnailUrls({ channels, baseUrl: "http://127.0.0.1:3002" })([])).toEqual(
      new Map(),
    );
    expect(reads).toEqual([]);
  });
});
