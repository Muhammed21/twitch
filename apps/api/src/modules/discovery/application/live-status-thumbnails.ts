import type { ThumbnailUrlReader } from "./list-lives.ts";
import type { LiveStatusReader } from "./live-status-hub.ts";

export const withThumbnails = ({
  statuses,
  thumbnailUrls,
  onThumbnailFailure,
}: {
  statuses: LiveStatusReader;
  thumbnailUrls: ThumbnailUrlReader;
  onThumbnailFailure: (error: unknown) => void;
}): LiveStatusReader => ({
  read: async (channelIds) => {
    const read = await statuses.read(channelIds);
    const liveChannelIds = read
      .filter(({ startedAt }) => startedAt !== undefined)
      .map(({ channelId }) => channelId);
    if (liveChannelIds.length === 0) {
      return read;
    }
    const urls = await thumbnailUrls(liveChannelIds).catch((error: unknown) => {
      onThumbnailFailure(error);
      return new Map<string, string>();
    });
    return read.map((status) => {
      const thumbnailUrl = urls.get(status.channelId);
      return thumbnailUrl === undefined ? status : { ...status, thumbnailUrl };
    });
  },
});
