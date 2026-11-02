import { type LogSink, writeLog } from "../../../platform/logging.ts";
import type { StreamHandler } from "../../../platform/stream-consumer.ts";
import { DISCOVERY_EVENT_READERS } from "../application/read-discovery-event.ts";
import type { DiscoveryEvent } from "../domain/live-channel-view.ts";

export const discoveryEventHandlers = ({
  project,
  logSink,
}: {
  project: (input: { eventId: string; event: DiscoveryEvent }) => Promise<void>;
  logSink: LogSink;
}): Readonly<Record<string, StreamHandler>> =>
  Object.fromEntries(
    Object.entries(DISCOVERY_EVENT_READERS).map(([name, read]) => [
      name,
      async (event) => {
        const decoded = read(event);
        if (decoded === null) {
          writeLog(logSink, {
            level: "error",
            msg: "event écarté : payload hors contrat",
            event: event.name,
            eventId: event.id,
          });
          return;
        }
        await project({ eventId: event.id, event: decoded });
      },
    ]),
  );
