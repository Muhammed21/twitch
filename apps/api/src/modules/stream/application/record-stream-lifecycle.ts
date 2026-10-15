import {
  type ArchivedSession,
  decideLifecycle,
  type LifecycleDecision,
  type LifecycleEvent,
  type SessionClosing,
  type SessionState,
} from "../domain/stream-lifecycle.ts";

export type ProviderLifecycleEvent = LifecycleEvent & {
  readonly eventId: string;
  readonly providerChannelId: string;
};

export type StreamLifecyclePublication = {
  readonly outboxEventId: string;
  readonly kind: "started" | "ended";
  readonly sessionId: string;
  readonly channelId: string;
  readonly at: Date;
};

export type NewSession = {
  readonly id: string;
  readonly channelId: string;
  readonly providerSessionId: string;
  readonly startedAt: Date;
};

export interface LifecycleTransaction {
  alreadyProcessed(eventId: string): Promise<boolean>;
  channelOf(providerChannelId: string): Promise<string | null>;
  openSessionOf(channelId: string): Promise<SessionState | null>;
  sessionByProvider(providerSessionId: string): Promise<SessionState | null>;
  followingSessionOf(channelId: string, after: Date): Promise<SessionState | null>;
  closeSession(closing: SessionClosing): Promise<void>;
  openSession(session: NewSession): Promise<void>;
  archiveSession(
    session: ArchivedSession & { readonly id: string; readonly channelId: string },
  ): Promise<void>;
  publish(publication: StreamLifecyclePublication): Promise<void>;
}

export interface StreamSessions {
  transaction<T>(work: (tx: LifecycleTransaction) => Promise<T>): Promise<T>;
}

export type LifecycleOutcome = {
  readonly status:
    | "recorded"
    | "unchanged"
    | "already-processed"
    | "unknown-channel"
    | "not-yet-started";
};

class WaitForStart extends Error {}

const applyChanges = async ({
  tx,
  decision,
  channelId,
  newId,
}: {
  tx: LifecycleTransaction;
  decision: Extract<LifecycleDecision, { kind: "apply" }>;
  channelId: string;
  newId: () => string;
}): Promise<void> => {
  const opening = decision.open === null ? null : { ...decision.open, id: newId(), channelId };
  for (const closing of decision.close) {
    await tx.closeSession(closing);
    await tx.publish({
      outboxEventId: newId(),
      kind: "ended",
      sessionId: closing.sessionId,
      channelId,
      at: closing.endedAt,
    });
  }
  if (opening !== null) {
    await tx.openSession(opening);
    await tx.publish({
      outboxEventId: newId(),
      kind: "started",
      sessionId: opening.id,
      channelId,
      at: opening.startedAt,
    });
  }
};

const applyDecision = async ({
  tx,
  event,
  channelId,
  newId,
}: {
  tx: LifecycleTransaction;
  event: ProviderLifecycleEvent;
  channelId: string;
  newId: () => string;
}): Promise<"recorded" | "unchanged"> => {
  const decision = decideLifecycle({
    event,
    open: await tx.openSessionOf(channelId),
    known: await tx.sessionByProvider(event.providerSessionId),
    following: await tx.followingSessionOf(channelId, event.occurredAt),
  });
  if (decision.kind === "wait-for-start") {
    throw new WaitForStart();
  }
  if (decision.kind === "nothing") {
    return "unchanged";
  }
  if (decision.kind === "archive") {
    await tx.archiveSession({ ...decision.session, id: newId(), channelId });
  }
  if (decision.kind === "apply") {
    await applyChanges({ tx, decision, channelId, newId });
  }
  return "recorded";
};

export const recordStreamLifecycle =
  ({ sessions, newId }: { sessions: StreamSessions; newId: () => string }) =>
  (event: ProviderLifecycleEvent): Promise<LifecycleOutcome> =>
    sessions
      .transaction(async (tx): Promise<LifecycleOutcome> => {
        if (await tx.alreadyProcessed(event.eventId)) {
          return { status: "already-processed" };
        }
        const channelId = await tx.channelOf(event.providerChannelId);
        if (channelId === null) {
          return { status: "unknown-channel" };
        }
        return { status: await applyDecision({ tx, event, channelId, newId }) };
      })
      .catch((error: unknown) => {
        if (error instanceof WaitForStart) {
          return { status: "not-yet-started" };
        }
        throw error;
      });
