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

export type LifecycleDecision = {
  readonly close: readonly SessionClosing[];
  readonly open: SessionOpening | null;
};

const NOTHING: LifecycleDecision = { close: [], open: null };

const closing = (session: SessionState, at: Date): SessionClosing => ({
  sessionId: session.id,
  endedAt: new Date(Math.max(at.getTime(), session.startedAt.getTime())),
});

export const decideLifecycle = ({
  event,
  open,
  known,
}: {
  event: LifecycleEvent;
  open: SessionState | null;
  known: SessionState | null;
}): LifecycleDecision => {
  if (event.kind === "ended") {
    return known?.endedAt === null
      ? { close: [closing(known, event.occurredAt)], open: null }
      : NOTHING;
  }
  if (known !== null) {
    return NOTHING;
  }
  return {
    close: open === null ? [] : [closing(open, event.occurredAt)],
    open: { providerSessionId: event.providerSessionId, startedAt: event.occurredAt },
  };
};
