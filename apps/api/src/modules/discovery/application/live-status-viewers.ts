import type { LiveStatusReader } from "./live-status-hub.ts";

export type ViewerCountReader = (
  channelIds: readonly string[],
) => Promise<ReadonlyMap<string, number>>;

export const withViewerCounts = ({
  statuses,
  viewerCounts,
  onViewerCountFailure,
}: {
  statuses: LiveStatusReader;
  viewerCounts: ViewerCountReader;
  onViewerCountFailure: (error: unknown) => void;
}): LiveStatusReader => ({
  read: async (channelIds) => {
    const read = await statuses.read(channelIds);
    const liveChannelIds = read
      .filter(({ startedAt }) => startedAt !== undefined)
      .map(({ channelId }) => channelId);
    const counts = await viewerCounts(liveChannelIds).catch((error: unknown) => {
      onViewerCountFailure(error);
      return undefined;
    });
    if (counts === undefined) {
      return read;
    }
    return read.map((status) =>
      status.startedAt === undefined
        ? status
        : { ...status, viewerCount: counts.get(status.channelId) ?? 0 },
    );
  },
});
