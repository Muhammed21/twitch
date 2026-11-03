import { err, ok, type Result } from "@repo/result";

export type ChannelLiveStatus = {
  readonly channelId: string;
  readonly startedAt: Date | undefined;
};

export interface LiveStatusReader {
  read(channelIds: readonly string[]): Promise<readonly ChannelLiveStatus[]>;
}

export type LiveStatusListener = (status: ChannelLiveStatus) => void;

type Subscriber = {
  readonly listener: LiveStatusListener;
  sent: ChannelLiveStatus;
};

const sameStatus = (left: ChannelLiveStatus, right: ChannelLiveStatus): boolean =>
  left.startedAt?.getTime() === right.startedAt?.getTime();

export const createLiveStatusHub = (reader: LiveStatusReader) => {
  const subscribers = new Map<string, Set<Subscriber>>();

  const subscribe = async (
    channelId: string,
    listener: LiveStatusListener,
  ): Promise<Result<() => void, "unknown_channel">> => {
    const [current] = await reader.read([channelId]);
    if (current === undefined) {
      return err("unknown_channel");
    }
    const subscriber: Subscriber = { listener, sent: current };
    const channelSubscribers = subscribers.get(channelId) ?? new Set<Subscriber>();
    subscribers.set(channelId, channelSubscribers.add(subscriber));
    listener(current);
    return ok(() => {
      channelSubscribers.delete(subscriber);
      if (channelSubscribers.size === 0 && subscribers.get(channelId) === channelSubscribers) {
        subscribers.delete(channelId);
      }
    });
  };

  const tick = async (): Promise<void> => {
    if (subscribers.size === 0) {
      return;
    }
    const statuses = await reader.read([...subscribers.keys()]);
    statuses.forEach((status) => {
      [...(subscribers.get(status.channelId) ?? [])]
        .filter((subscriber) => !sameStatus(subscriber.sent, status))
        .forEach((subscriber) => {
          subscriber.sent = status;
          subscriber.listener(status);
        });
    });
  };

  return { subscribe, tick };
};

export type LiveStatusHub = ReturnType<typeof createLiveStatusHub>;
