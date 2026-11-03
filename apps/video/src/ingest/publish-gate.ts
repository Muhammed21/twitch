import type { VideoStore } from "../control-plane/control-plane.ts";
import { lifecycleEvent, openSession, publish, stop } from "../domain/ingest.ts";
import type { Publication } from "../rtmp/rtmp-server.ts";

export const createPublishGate =
  ({ store, newId, now }: { store: VideoStore; newId: () => string; now: () => Date }) =>
  async (streamKey: string): Promise<Publication | undefined> => {
    const channel = await store.findChannelByStreamKey(streamKey);
    if (channel === undefined) {
      return undefined;
    }
    const live = publish({
      channel,
      presentedKey: streamKey,
      session: openSession({ id: newId(), channelId: channel.id }),
      channelSessions: (await store.liveSessions()).filter(
        ({ channelId }) => channelId === channel.id,
      ),
      now: now(),
    });
    if (!live.ok) {
      return undefined;
    }
    await store.saveSession(live.value, [lifecycleEvent({ id: newId(), session: live.value })]);
    return {
      end: async () => {
        const current = (await store.liveSessions()).find(({ id }) => id === live.value.id);
        const ended = current === undefined ? undefined : stop(current, now());
        if (ended?.ok === true) {
          await store.saveSession(ended.value, [
            lifecycleEvent({ id: newId(), session: ended.value }),
          ]);
        }
      },
    };
  };
