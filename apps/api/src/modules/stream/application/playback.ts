export type PlaybackSessions = {
  readonly openProviderSessionOf: (channelId: string) => Promise<string | null>;
};

export type Playback = { readonly playbackUrl: string };

export type GetPlayback = (channelId: string) => Promise<Playback | null>;

export const getPlayback =
  ({ sessions, baseUrl }: { sessions: PlaybackSessions; baseUrl: string }): GetPlayback =>
  async (channelId) => {
    const sessionId = await sessions.openProviderSessionOf(channelId);
    return sessionId === null
      ? null
      : { playbackUrl: `${baseUrl.replace(/\/$/, "")}/hls/${sessionId}/master.m3u8` };
  };
