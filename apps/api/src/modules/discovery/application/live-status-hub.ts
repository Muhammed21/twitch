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
  readonly readNumber: number;
  sent: ChannelLiveStatus;
};

const sameStatus = (left: ChannelLiveStatus, right: ChannelLiveStatus): boolean =>
  left.startedAt?.getTime() === right.startedAt?.getTime();

export const createLiveStatusHub = (reader: LiveStatusReader) => {
  const subscribers = new Map<string, Set<Subscriber>>();
  const reads = { started: 0 };
  const startRead = (): number => {
    reads.started += 1;
    return reads.started;
  };

  const subscribe = async (
    channelId: string,
    listener: LiveStatusListener,
  ): Promise<Result<() => void, "unknown_channel">> => {
    const readNumber = startRead();
    const [current] = await reader.read([channelId]);
    if (current === undefined) {
      return err("unknown_channel");
    }
    const subscriber: Subscriber = { listener, readNumber, sent: current };
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
    const tickNumber = startRead();
    const statuses = await reader.read([...subscribers.keys()]);
    const statusByChannel = new Map(statuses.map((status) => [status.channelId, status]));
    subscribers.forEach((channelSubscribers, channelId) => {
      const status = statusByChannel.get(channelId);
      if (status === undefined) {
        return;
      }
      [...channelSubscribers]
        .filter((subscriber) => subscriber.readNumber < tickNumber)
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
