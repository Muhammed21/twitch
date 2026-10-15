import { type ChannelSlug, slugCandidates } from "../domain/channel-slug.ts";

export type AccountRegistration = {
  readonly eventId: string;
  readonly accountId: string;
  readonly displayName: string;
};

export type NewChannel = {
  readonly eventId: string;
  readonly channelId: string;
  readonly outboxEventId: string;
  readonly ownerId: string;
  readonly candidates: readonly ChannelSlug[];
  readonly occurredAt: Date;
};

export type RegistryOutcome =
  | { readonly status: "created"; readonly slug: string }
  | { readonly status: "already-processed" };

export interface ChannelRegistry {
  createForAccount(channel: NewChannel): Promise<RegistryOutcome>;
}

export interface OwnerAssignmentsCache {
  invalidate(ownerId: string): Promise<void>;
}

export type ChannelCreation =
  | { readonly status: "created"; readonly slug: string; readonly cacheInvalidated: boolean }
  | { readonly status: "already-processed" };

const invalidated = (cache: OwnerAssignmentsCache, ownerId: string): Promise<boolean> =>
  cache.invalidate(ownerId).then(
    () => true,
    () => false,
  );

export const createChannelForAccount =
  ({
    registry,
    cache,
    newId,
    now,
  }: {
    registry: ChannelRegistry;
    cache: OwnerAssignmentsCache;
    newId: () => string;
    now: () => Date;
  }) =>
  async ({ eventId, accountId, displayName }: AccountRegistration): Promise<ChannelCreation> => {
    const outcome = await registry.createForAccount({
      eventId,
      channelId: newId(),
      outboxEventId: newId(),
      ownerId: accountId,
      candidates: slugCandidates({ displayName, accountId }),
      occurredAt: now(),
    });
    if (outcome.status === "already-processed") {
      return outcome;
    }
    return { ...outcome, cacheInvalidated: await invalidated(cache, accountId) };
  };
