import { randomBytes, randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  type IngestSession,
  type LifecycleEvent,
  lifecycleEvent,
  streamKeyFrom,
  type VideoChannel,
} from "../../domain/ingest.ts";
import type { VideoStore } from "../control-plane.ts";

export type InspectableVideoStore = VideoStore & {
  readonly eventsOf: (sessionId: string) => Promise<readonly LifecycleEvent[]>;
};

const STARTED_AT = new Date("2026-11-03T20:00:00.000Z");
const ENDED_AT = new Date("2026-11-03T21:00:00.000Z");

const newStreamKey = (): string => {
  const key = streamKeyFrom(randomBytes);
  if (!key.ok) {
    throw new Error("entropie invalide");
  }
  return key.value;
};

export const makeVideoChannel = (): VideoChannel => ({
  id: randomUUID(),
  externalId: randomUUID(),
  streamKey: newStreamKey(),
});

const idleSession = (channelId: string): IngestSession => ({
  state: "idle",
  id: randomUUID(),
  channelId,
});

const liveSession = (session: IngestSession) => ({
  state: "live" as const,
  id: session.id,
  channelId: session.channelId,
  startedAt: STARTED_AT,
});

const endedSession = (session: IngestSession) => ({
  state: "ended" as const,
  id: session.id,
  channelId: session.channelId,
  startedAt: STARTED_AT,
  endedAt: ENDED_AT,
});

export const describeVideoStoreContract = ({
  name,
  store,
}: {
  name: string;
  store: () => InspectableVideoStore;
}) => {
  describe(`dépôt du plan de contrôle vidéo : ${name}`, () => {
    it("retrouve un canal enregistré par son identifiant et par son identifiant externe", async () => {
      const videoStore = store();
      const channel = makeVideoChannel();

      await videoStore.saveChannel(channel);

      expect(await videoStore.findChannel(channel.id)).toEqual(channel);
      expect(await videoStore.findChannelByExternalId(channel.externalId)).toEqual(channel);
    });

    it("ne retrouve aucun canal inconnu, même à un identifiant qui n'est pas un UUID", async () => {
      const videoStore = store();

      expect(await videoStore.findChannel(randomUUID())).toBeUndefined();
      expect(await videoStore.findChannel("inconnu")).toBeUndefined();
      expect(await videoStore.findChannelByExternalId(randomUUID())).toBeUndefined();
    });

    it("remplace la clé d'un canal enregistré une seconde fois", async () => {
      const videoStore = store();
      const channel = makeVideoChannel();
      await videoStore.saveChannel(channel);
      const rotated = { ...channel, streamKey: newStreamKey() };

      await videoStore.saveChannel(rotated);

      expect(await videoStore.findChannel(channel.id)).toEqual(rotated);
    });

    it("ne liste que les sessions live", async () => {
      const videoStore = store();
      const channels = [makeVideoChannel(), makeVideoChannel(), makeVideoChannel()];
      await Promise.all(channels.map((channel) => videoStore.saveChannel(channel)));
      const [idle, live, ended] = channels.map(({ id }) => idleSession(id));
      if (idle === undefined || live === undefined || ended === undefined) {
        throw new Error("sessions manquantes");
      }
      await videoStore.saveSession(idle, []);
      await videoStore.saveSession(liveSession(live), []);
      await videoStore.saveSession(endedSession(ended), []);

      const ours = (await videoStore.liveSessions()).filter(({ channelId }) =>
        channels.some(({ id }) => id === channelId),
      );

      expect(ours).toEqual([liveSession(live)]);
    });

    it("suit une session de idle à live puis ended", async () => {
      const videoStore = store();
      const channel = makeVideoChannel();
      await videoStore.saveChannel(channel);
      const session = idleSession(channel.id);
      const liveOf = async () =>
        (await videoStore.liveSessions()).filter(({ id }) => id === session.id);

      await videoStore.saveSession(session, []);
      expect(await liveOf()).toEqual([]);
      await videoStore.saveSession(liveSession(session), []);
      expect(await liveOf()).toEqual([liveSession(session)]);
      await videoStore.saveSession(endedSession(session), []);
      expect(await liveOf()).toEqual([]);
    });

    it("enregistre les événements d'une session avec elle, et rien pour une session sans événement", async () => {
      const videoStore = store();
      const [channel, otherChannel] = [makeVideoChannel(), makeVideoChannel()];
      await videoStore.saveChannel(channel);
      await videoStore.saveChannel(otherChannel);
      const session = idleSession(channel.id);
      const other = liveSession(idleSession(otherChannel.id));
      const started = lifecycleEvent({ id: randomUUID(), session: liveSession(session) });
      const ended = lifecycleEvent({ id: randomUUID(), session: endedSession(session) });

      await videoStore.saveSession(session, []);
      expect(await videoStore.eventsOf(session.id)).toEqual([]);
      await videoStore.saveSession(other, [lifecycleEvent({ id: randomUUID(), session: other })]);
      await videoStore.saveSession(liveSession(session), [started]);
      await videoStore.saveSession(endedSession(session), [ended]);

      expect(await videoStore.eventsOf(session.id)).toEqual([started, ended]);
    });
  });
};
