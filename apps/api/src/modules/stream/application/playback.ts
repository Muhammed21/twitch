export type PlaybackSessions = {
  readonly liveProviderChannelOf: (channelId: string) => Promise<string | null>;
};

export type Playback = { readonly playbackUrl: string };

export type GetPlayback = (channelId: string) => Promise<Playback | null>;

export const getPlayback =
  ({ sessions, baseUrl }: { sessions: PlaybackSessions; baseUrl: string }): GetPlayback =>
  async (channelId) => {
    const providerChannelId = await sessions.liveProviderChannelOf(channelId);
    return providerChannelId === null
      ? null
      : {
          playbackUrl: `${baseUrl.replace(/\/$/, "")}/hls/channels/${providerChannelId}/master.m3u8`,
        };
  };
