export type ProviderChannels = {
  readonly providerChannelsOf: (
    channelIds: readonly string[],
  ) => Promise<ReadonlyMap<string, string>>;
};

export type GetThumbnailUrls = (
  channelIds: readonly string[],
) => Promise<ReadonlyMap<string, string>>;

export const getThumbnailUrls =
  ({ channels, baseUrl }: { channels: ProviderChannels; baseUrl: string }): GetThumbnailUrls =>
  async (channelIds) => {
    if (channelIds.length === 0) {
      return new Map();
    }
    const base = baseUrl.replace(/\/$/, "");
    const providers = await channels.providerChannelsOf(channelIds);
    return new Map(
      [...providers].map(([channelId, providerChannelId]) => [
        channelId,
        `${base}/hls/channels/${providerChannelId}/thumbnail.jpg`,
      ]),
    );
  };
