import type { LiveStatusReader } from "./live-status-hub.ts";

export type ViewerCountReader = (
  channelIds: readonly string[],
) => Promise<ReadonlyMap<string, number>>;

export type ViewerCountSource = {
  viewerCounts: ViewerCountReader;
  onViewerCountFailure: (error: unknown) => void;
};

export const readViewerCounts = (
  { viewerCounts, onViewerCountFailure }: ViewerCountSource,
  channelIds: readonly string[],
): Promise<ReadonlyMap<string, number> | undefined> =>
  viewerCounts(channelIds).catch((error: unknown) => {
    onViewerCountFailure(error);
    return undefined;
  });

export const withViewerCounts = ({
  statuses,
  ...source
}: { statuses: LiveStatusReader } & ViewerCountSource): LiveStatusReader => ({
  read: async (channelIds) => {
    const read = await statuses.read(channelIds);
    const liveChannelIds = read
      .filter(({ startedAt }) => startedAt !== undefined)
      .map(({ channelId }) => channelId);
    const counts = await readViewerCounts(source, liveChannelIds);
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
