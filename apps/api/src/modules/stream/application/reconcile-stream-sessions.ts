import { forgottenByProvider } from "../domain/stream-reconciliation.ts";
import type { LiveVideoProviderPort } from "./live-video-provider.ts";
import type { LifecycleOutcome, ProviderLifecycleEvent } from "./record-stream-lifecycle.ts";

export type OpenSession = {
  readonly providerSessionId: string;
  readonly providerChannelId: string;
  readonly startedAt: Date;
};

export interface OpenStreamSessions {
  list(): Promise<readonly OpenSession[]>;
}

export type ReconciliationOutcome = { readonly closed: readonly string[] };

export const reconcileStreamSessions =
  ({
    provider,
    openSessions,
    record,
    endEventIdOf,
  }: {
    provider: Pick<LiveVideoProviderPort, "listLiveSessions">;
    openSessions: OpenStreamSessions;
    record: (event: ProviderLifecycleEvent) => Promise<LifecycleOutcome>;
    endEventIdOf: (providerSessionId: string) => string;
  }) =>
  async (now: Date): Promise<ReconciliationOutcome> => {
    const live = new Set(
      (await provider.listLiveSessions()).map(({ providerSessionId }) => providerSessionId),
    );
    const forgotten = forgottenByProvider({ open: await openSessions.list(), live, now });
    const closed = await forgotten.reduce<Promise<readonly string[]>>(
      async (previous, { providerSessionId, providerChannelId }) => {
        const done = await previous;
        const outcome = await record({
          eventId: endEventIdOf(providerSessionId),
          kind: "ended",
          providerChannelId,
          providerSessionId,
          occurredAt: now,
        });
        return outcome.status === "recorded" ? [...done, providerSessionId] : done;
      },
      Promise.resolve([]),
    );
    return { closed };
  };
