export type LifecycleEvent = {
  readonly kind: "started" | "ended";
  readonly providerSessionId: string;
  readonly occurredAt: Date;
};

export type SessionState = {
  readonly id: string;
  readonly providerSessionId: string;
  readonly startedAt: Date;
  readonly endedAt: Date | null;
};

export type SessionClosing = { readonly sessionId: string; readonly endedAt: Date };

export type SessionOpening = { readonly providerSessionId: string; readonly startedAt: Date };

export type ArchivedSession = SessionOpening & { readonly endedAt: Date };

export type LifecycleDecision =
  | { readonly kind: "nothing" }
  | { readonly kind: "wait-for-start" }
  | { readonly kind: "archive"; readonly session: ArchivedSession }
  | {
      readonly kind: "apply";
      readonly close: readonly SessionClosing[];
      readonly open: SessionOpening | null;
    };

const NOTHING: LifecycleDecision = { kind: "nothing" };

const closing = (session: SessionState, at: Date): SessionClosing => ({
  sessionId: session.id,
  endedAt: new Date(Math.max(at.getTime(), session.startedAt.getTime())),
});

const decideEnd = (event: LifecycleEvent, known: SessionState | null): LifecycleDecision => {
  if (known === null) {
    return { kind: "wait-for-start" };
  }
  return known.endedAt === null
    ? { kind: "apply", close: [closing(known, event.occurredAt)], open: null }
    : NOTHING;
};

export const decideLifecycle = ({
  event,
  open,
  known,
  following,
}: {
  event: LifecycleEvent;
  open: SessionState | null;
  known: SessionState | null;
  following: SessionState | null;
}): LifecycleDecision => {
  if (event.kind === "ended") {
    return decideEnd(event, known);
  }
  if (known !== null) {
    return NOTHING;
  }
  const opening = { providerSessionId: event.providerSessionId, startedAt: event.occurredAt };
  if (following !== null) {
    return { kind: "archive", session: { ...opening, endedAt: following.startedAt } };
  }
  return {
    kind: "apply",
    close: open === null ? [] : [{ sessionId: open.id, endedAt: event.occurredAt }],
    open: opening,
  };
};
