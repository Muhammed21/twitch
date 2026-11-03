import { z } from "zod";

import type { ChatterSanction } from "../application/ports.ts";
import type { ChatIo } from "./chat-events.ts";

const SANCTION_EVENT = "chat:sanction";

const SanctionMessage = z.object({
  userId: z.string().min(1),
  channelId: z.string().min(1),
  expiresAt: z.iso.datetime().transform((value) => new Date(value)),
});

export const publishSanction = (io: ChatIo, sanction: ChatterSanction): void => {
  io.serverSideEmit(SANCTION_EVENT, { ...sanction, expiresAt: sanction.expiresAt.toISOString() });
};

export const onRemoteSanction = ({
  io,
  apply,
  log,
}: {
  io: ChatIo;
  apply: (sanction: ChatterSanction) => void;
  log: (entry: Readonly<Record<string, unknown>>) => void;
}): void => {
  io.on(SANCTION_EVENT, (payload: unknown) => {
    const parsed = SanctionMessage.safeParse(payload);
    if (!parsed.success) {
      log({ level: "error", msg: "sanction relayée hors contrat" });
      return;
    }
    apply(parsed.data);
  });
};
