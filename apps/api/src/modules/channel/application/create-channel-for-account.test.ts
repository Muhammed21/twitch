import { describe, expect, it } from "vitest";

import { slugCandidates } from "../domain/channel-slug.ts";
import {
  type ChannelRegistry,
  createChannelForAccount,
  type NewChannel,
  type OwnerAssignmentsCache,
} from "./create-channel-for-account.ts";

const NOW = new Date("2026-10-15T10:00:00.000Z");
const ACCOUNT_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";

const makeRegistration = () => ({
  eventId: "0e1d2c3b-4a59-4687-9a1b-2c3d4e5f6a7b",
  accountId: ACCOUNT_ID,
  displayName: "Streamer de test",
});

const recordingRegistry = (outcome: "created" | "already-processed") => {
  const requests: NewChannel[] = [];
  const registry: ChannelRegistry = {
    createForAccount: async (request) => {
      requests.push(request);
      return outcome === "created"
        ? { status: "created", slug: "streamer_de_test" }
        : { status: outcome };
    },
  };
  return { requests, registry };
};

const recordingCache = (failure?: Error) => {
  const invalidated: string[] = [];
  const cache: OwnerAssignmentsCache = {
    invalidate: async (ownerId) => {
      invalidated.push(ownerId);
      if (failure !== undefined) {
        throw failure;
      }
    },
  };
  return { invalidated, cache };
};

const sequentialIds = () => {
  const issued: string[] = [];
  return () => {
    const id = `00000000-0000-4000-8000-00000000000${issued.length + 1}`;
    issued.push(id);
    return id;
  };
};

const handle = ({ registry, cache }: { registry: ChannelRegistry; cache: OwnerAssignmentsCache }) =>
  createChannelForAccount({ registry, cache, newId: sequentialIds(), now: () => NOW });

describe("création de la chaîne d'un compte inscrit", () => {
  it("demande la chaîne du compte avec les slugs candidats de son nom", async () => {
    const { requests, registry } = recordingRegistry("created");

    await handle({ registry, cache: recordingCache().cache })(makeRegistration());

    expect(requests).toEqual([
      {
        eventId: "0e1d2c3b-4a59-4687-9a1b-2c3d4e5f6a7b",
        channelId: "00000000-0000-4000-8000-000000000001",
        outboxEventId: "00000000-0000-4000-8000-000000000002",
        ownerId: ACCOUNT_ID,
        candidates: slugCandidates({ displayName: "Streamer de test", accountId: ACCOUNT_ID }),
        occurredAt: NOW,
      },
    ]);
  });

  it("invalide les attributions du propriétaire après la création", async () => {
    const { invalidated, cache } = recordingCache();

    const outcome = await handle({ registry: recordingRegistry("created").registry, cache })(
      makeRegistration(),
    );

    expect(invalidated).toEqual([ACCOUNT_ID]);
    expect(outcome).toEqual({
      status: "created",
      slug: "streamer_de_test",
      cacheInvalidated: true,
    });
  });

  it("n'invalide rien pour un event déjà traité", async () => {
    const { invalidated, cache } = recordingCache();

    const outcome = await handle({
      registry: recordingRegistry("already-processed").registry,
      cache,
    })(makeRegistration());

    expect(invalidated).toEqual([]);
    expect(outcome).toEqual({ status: "already-processed" });
  });

  it("garde la chaîne créée quand l'invalidation échoue, et le signale", async () => {
    const outcome = await handle({
      registry: recordingRegistry("created").registry,
      cache: recordingCache(new Error("Redis n'a pas répondu en 2000 ms")).cache,
    })(makeRegistration());

    expect(outcome).toEqual({
      status: "created",
      slug: "streamer_de_test",
      cacheInvalidated: false,
    });
  });
});
