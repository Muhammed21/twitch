const PROVIDER_LISTING_DELAY_MS = 5 * 60_000;

type ReconciledSession = { readonly providerSessionId: string; readonly startedAt: Date };

export const forgottenByProvider = <S extends ReconciledSession>({
  open,
  live,
  now,
}: {
  open: readonly S[];
  live: ReadonlySet<string>;
  now: Date;
}): readonly S[] =>
  open.filter(
    (session) =>
      !live.has(session.providerSessionId) &&
      now.getTime() - session.startedAt.getTime() >= PROVIDER_LISTING_DELAY_MS,
  );
