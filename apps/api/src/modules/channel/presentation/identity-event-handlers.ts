import { events } from "@repo/contracts";

import { type LogSink, writeLog } from "../../../platform/logging.ts";
import type { StreamHandler } from "../../../platform/stream-consumer.ts";
import type {
  AccountRegistration,
  ChannelCreation,
} from "../application/create-channel-for-account.ts";

const { accountRegistered } = events.identity;

export const identityEventHandlers = ({
  createChannel,
  logSink,
}: {
  createChannel: (registration: AccountRegistration) => Promise<ChannelCreation>;
  logSink: LogSink;
}): Readonly<Record<string, StreamHandler>> => ({
  [accountRegistered.name]: async (event) => {
    const payload = accountRegistered.payload.safeParse(event.payload);
    if (!payload.success) {
      writeLog(logSink, {
        level: "error",
        msg: "event écarté : payload hors contrat",
        event: event.name,
        eventId: event.id,
      });
      return;
    }
    const outcome = await createChannel({
      eventId: event.id,
      accountId: payload.data.accountId,
      displayName: payload.data.displayName,
    });
    if (outcome.status === "created" && !outcome.cacheInvalidated) {
      writeLog(logSink, {
        level: "error",
        msg: "attributions du propriétaire non invalidées",
        eventId: event.id,
      });
    }
  },
});
