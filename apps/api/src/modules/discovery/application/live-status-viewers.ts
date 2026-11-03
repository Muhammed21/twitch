import type { LiveStatusReader } from "./live-status-hub.ts";

export type ViewerCountReader = (
  channelIds: readonly string[],
) => Promise<ReadonlyMap<string, number>>;

export const withViewerCounts = ({
  statuses,
  viewerCounts,
}: {
  statuses: LiveStatusReader;
  viewerCounts: ViewerCountReader;
}): LiveStatusReader => ({
  read: async (channelIds) => {
    const read = await statuses.read(channelIds);
    const counts = await viewerCounts(
      read.filter(({ startedAt }) => startedAt !== undefined).map(({ channelId }) => channelId),
    );
    return read.map((status) =>
      status.startedAt === undefined
        ? status
        : { ...status, viewerCount: counts.get(status.channelId) ?? 0 },
    );
  },
});
