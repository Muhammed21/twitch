import type { VideoStore } from "../control-plane/control-plane.ts";
import { lifecycleEvent, openSession, publish, stop } from "../domain/ingest.ts";

export type IngestPublication = {
  readonly sessionId: string;
  readonly end: () => Promise<void>;
};

export const createPublishGate =
  ({ store, newId, now }: { store: VideoStore; newId: () => string; now: () => Date }) =>
  async (streamKey: string): Promise<IngestPublication | undefined> => {
    const channel = await store.findChannelByStreamKey(streamKey);
    if (channel === undefined) {
      return undefined;
    }
    const live = publish({
      channel,
      presentedKey: streamKey,
      session: openSession({ id: newId(), channelId: channel.id }),
      channelSessions: [await store.liveSessionOf(channel.id)].filter(
        (session) => session !== undefined,
      ),
      now: now(),
    });
    if (!live.ok) {
      return undefined;
    }
    await store.saveSession(live.value, [lifecycleEvent({ id: newId(), session: live.value })]);
    return {
      sessionId: live.value.id,
      end: async () => {
        const current = await store.liveSessionOf(live.value.channelId);
        const ended = current?.id === live.value.id ? stop(current, now()) : undefined;
        if (ended?.ok === true) {
          await store.saveSession(ended.value, [
            lifecycleEvent({ id: newId(), session: ended.value }),
          ]);
        }
      },
    };
  };
