import { events } from "@repo/contracts";

import { type LogSink, writeLog } from "../../../platform/logging.ts";
import type { StreamHandler } from "../../../platform/stream-consumer.ts";

const { channelCreated } = events.channel;

export const channelEventHandlers = ({
  provision,
  logSink,
}: {
  provision: (input: { channelId: string }) => Promise<void>;
  logSink: LogSink;
}): Readonly<Record<string, StreamHandler>> => ({
  [channelCreated.name]: async (event) => {
    if (event.version !== channelCreated.version) {
      throw new Error(`${event.name} version ${event.version} non gérée`);
    }
    const payload = channelCreated.payload.safeParse(event.payload);
    if (!payload.success) {
      writeLog(logSink, {
        level: "error",
        msg: "event écarté : payload hors contrat",
        event: event.name,
        eventId: event.id,
      });
      return;
    }
    await provision({ channelId: payload.data.channelId });
  },
});
