import { describe, expect, it } from "vitest";

import {
  type ChannelLiveStatus,
  createLiveStatusHub,
  type LiveStatusReader,
} from "./live-status-hub.ts";

const LIVE_CHANNEL = "00000000-0000-4000-8000-000000000001";
const OFFLINE_CHANNEL = "00000000-0000-4000-8000-000000000002";
const UNKNOWN_CHANNEL = "00000000-0000-4000-8000-000000000003";

const STARTED_AT = new Date("2026-11-03T20:00:00.000Z");

const makeProjection = (initial: readonly ChannelLiveStatus[]) => {
  const state = new Map(initial.map((status) => [status.channelId, status]));
  const reads: (readonly string[])[] = [];
  const reader: LiveStatusReader = {
    read: async (channelIds) => {
      reads.push(channelIds.toSorted());
      return channelIds.flatMap((channelId) => {
        const status = state.get(channelId);
        return status === undefined ? [] : [status];
      });
    },
  };
  return {
    reader,
    reads,
    set: (status: ChannelLiveStatus) => {
      state.set(status.channelId, status);
    },
  };
};

const liveStatus = (channelId: string, startedAt = STARTED_AT): ChannelLiveStatus => ({
  channelId,
  startedAt,
});

const offlineStatus = (channelId: string): ChannelLiveStatus => ({
  channelId,
  startedAt: undefined,
});

const makeListener = () => {
  const received: ChannelLiveStatus[] = [];
  return { received, listener: (status: ChannelLiveStatus) => received.push(status) };
};

const subscribed = async (
  hub: ReturnType<typeof createLiveStatusHub>,
  channelId: string,
  listener: (status: ChannelLiveStatus) => void,
) => {
  const subscription = await hub.subscribe(channelId, listener);
  if (!subscription.ok) {
    throw new Error(`abonnement refusé : ${subscription.error}`);
  }
  return subscription.value;
};

describe("hub du statut des lives (canal 2, ADR 0004 §2)", () => {
  it("envoie l'état courant de la chaîne dès l'abonnement", async () => {
    const projection = makeProjection([liveStatus(LIVE_CHANNEL), offlineStatus(OFFLINE_CHANNEL)]);
    const hub = createLiveStatusHub(projection.reader);
    const live = makeListener();
    const offline = makeListener();

    await subscribed(hub, LIVE_CHANNEL, live.listener);
    await subscribed(hub, OFFLINE_CHANNEL, offline.listener);

    expect(live.received).toEqual([liveStatus(LIVE_CHANNEL)]);
    expect(offline.received).toEqual([offlineStatus(OFFLINE_CHANNEL)]);
  });

  it("refuse l'abonnement à une chaîne inconnue, sans la lire ensuite", async () => {
    const projection = makeProjection([]);
    const hub = createLiveStatusHub(projection.reader);
    const { received, listener } = makeListener();

    expect(await hub.subscribe(UNKNOWN_CHANNEL, listener)).toEqual({
      ok: false,
      error: "unknown_channel",
    });
    await hub.tick();

    expect(received).toEqual([]);
    expect(projection.reads).toEqual([[UNKNOWN_CHANNEL]]);
  });

  it("ne lit rien quand personne n'est abonné", async () => {
    const projection = makeProjection([liveStatus(LIVE_CHANNEL)]);

    await createLiveStatusHub(projection.reader).tick();

    expect(projection.reads).toEqual([]);
  });

  it("lit en une requête par tick toutes les chaînes suivies, quel que soit le nombre d'abonnés", async () => {
    const projection = makeProjection([liveStatus(LIVE_CHANNEL), offlineStatus(OFFLINE_CHANNEL)]);
    const hub = createLiveStatusHub(projection.reader);
    await subscribed(hub, LIVE_CHANNEL, makeListener().listener);
    await subscribed(hub, LIVE_CHANNEL, makeListener().listener);
    await subscribed(hub, OFFLINE_CHANNEL, makeListener().listener);

    await hub.tick();

    expect(projection.reads.slice(3)).toEqual([[LIVE_CHANNEL, OFFLINE_CHANNEL]]);
  });

  it("envoie au tick le changement d'état à chaque abonné de la chaîne, et à eux seuls", async () => {
    const projection = makeProjection([
      offlineStatus(LIVE_CHANNEL),
      offlineStatus(OFFLINE_CHANNEL),
    ]);
    const hub = createLiveStatusHub(projection.reader);
    const first = makeListener();
    const second = makeListener();
    const other = makeListener();
    await subscribed(hub, LIVE_CHANNEL, first.listener);
    await subscribed(hub, LIVE_CHANNEL, second.listener);
    await subscribed(hub, OFFLINE_CHANNEL, other.listener);

    projection.set(liveStatus(LIVE_CHANNEL));
    await hub.tick();

    expect(first.received).toEqual([offlineStatus(LIVE_CHANNEL), liveStatus(LIVE_CHANNEL)]);
    expect(second.received).toEqual([offlineStatus(LIVE_CHANNEL), liveStatus(LIVE_CHANNEL)]);
    expect(other.received).toEqual([offlineStatus(OFFLINE_CHANNEL)]);
  });

  it("n'envoie rien au tick quand l'état n'a pas changé", async () => {
    const projection = makeProjection([liveStatus(LIVE_CHANNEL)]);
    const hub = createLiveStatusHub(projection.reader);
    const { received, listener } = makeListener();
    await subscribed(hub, LIVE_CHANNEL, listener);

    projection.set(liveStatus(LIVE_CHANNEL, new Date(STARTED_AT)));
    await hub.tick();
    await hub.tick();

    expect(received).toEqual([liveStatus(LIVE_CHANNEL)]);
  });

  it("envoie un nouveau démarrage, même quand la chaîne était déjà en live", async () => {
    const projection = makeProjection([liveStatus(LIVE_CHANNEL)]);
    const hub = createLiveStatusHub(projection.reader);
    const { received, listener } = makeListener();
    await subscribed(hub, LIVE_CHANNEL, listener);
    const restartedAt = new Date("2026-11-03T21:00:00.000Z");

    projection.set(liveStatus(LIVE_CHANNEL, restartedAt));
    await hub.tick();

    expect(received).toEqual([liveStatus(LIVE_CHANNEL), liveStatus(LIVE_CHANNEL, restartedAt)]);
  });

  it("n'envoie que le dernier état quand plusieurs changements tombent entre deux ticks", async () => {
    const projection = makeProjection([offlineStatus(LIVE_CHANNEL)]);
    const hub = createLiveStatusHub(projection.reader);
    const { received, listener } = makeListener();
    await subscribed(hub, LIVE_CHANNEL, listener);

    projection.set(liveStatus(LIVE_CHANNEL));
    projection.set(offlineStatus(LIVE_CHANNEL));
    projection.set(liveStatus(LIVE_CHANNEL));
    await hub.tick();

    expect(received).toEqual([offlineStatus(LIVE_CHANNEL), liveStatus(LIVE_CHANNEL)]);
  });

  it("ne lit plus une chaîne dont le dernier abonné s'est désabonné, et ne lui envoie plus rien", async () => {
    const projection = makeProjection([
      offlineStatus(LIVE_CHANNEL),
      offlineStatus(OFFLINE_CHANNEL),
    ]);
    const hub = createLiveStatusHub(projection.reader);
    const leaving = makeListener();
    const unsubscribe = await subscribed(hub, LIVE_CHANNEL, leaving.listener);
    await subscribed(hub, OFFLINE_CHANNEL, makeListener().listener);

    unsubscribe();
    projection.set(liveStatus(LIVE_CHANNEL));
    await hub.tick();

    expect(leaving.received).toEqual([offlineStatus(LIVE_CHANNEL)]);
    expect(projection.reads.slice(2)).toEqual([[OFFLINE_CHANNEL]]);
  });

  it("continue d'envoyer aux autres abonnés d'une chaîne quand l'un d'eux se désabonne", async () => {
    const projection = makeProjection([offlineStatus(LIVE_CHANNEL)]);
    const hub = createLiveStatusHub(projection.reader);
    const leaving = makeListener();
    const staying = makeListener();
    const unsubscribe = await subscribed(hub, LIVE_CHANNEL, leaving.listener);
    await subscribed(hub, LIVE_CHANNEL, staying.listener);

    unsubscribe();
    projection.set(liveStatus(LIVE_CHANNEL));
    await hub.tick();

    expect(leaving.received).toEqual([offlineStatus(LIVE_CHANNEL)]);
    expect(staying.received).toEqual([offlineStatus(LIVE_CHANNEL), liveStatus(LIVE_CHANNEL)]);
  });

  it("ne retire pas un abonné arrivé après coup quand un ancien désabonnement est rejoué", async () => {
    const projection = makeProjection([offlineStatus(LIVE_CHANNEL)]);
    const hub = createLiveStatusHub(projection.reader);
    const unsubscribe = await subscribed(hub, LIVE_CHANNEL, makeListener().listener);
    unsubscribe();
    const late = makeListener();
    await subscribed(hub, LIVE_CHANNEL, late.listener);

    unsubscribe();
    projection.set(liveStatus(LIVE_CHANNEL));
    await hub.tick();

    expect(late.received).toEqual([offlineStatus(LIVE_CHANNEL), liveStatus(LIVE_CHANNEL)]);
  });

  it("ignore une chaîne dont le dernier abonné se désabonne pendant la lecture du tick", async () => {
    const projection = makeProjection([offlineStatus(LIVE_CHANNEL)]);
    const pending: { leave: () => void } = { leave: () => {} };
    const reader: LiveStatusReader = {
      read: async (channelIds) => {
        const statuses = await projection.reader.read(channelIds);
        pending.leave();
        return statuses;
      },
    };
    const hub = createLiveStatusHub(reader);
    const { received, listener } = makeListener();
    const unsubscribe = await subscribed(hub, LIVE_CHANNEL, listener);
    pending.leave = unsubscribe;

    projection.set(liveStatus(LIVE_CHANNEL));
    await hub.tick();

    expect(received).toEqual([offlineStatus(LIVE_CHANNEL)]);
  });

  it("n'envoie pas l'état périmé d'un tick à un abonné arrivé pendant sa lecture", async () => {
    const projection = makeProjection([offlineStatus(LIVE_CHANNEL)]);
    const during: { tickRead: () => Promise<void> } = { tickRead: async () => {} };
    const reader: LiveStatusReader = {
      read: async (channelIds) => {
        const statuses = await projection.reader.read(channelIds);
        const arriving = during.tickRead;
        during.tickRead = async () => {};
        await arriving();
        return statuses;
      },
    };
    const hub = createLiveStatusHub(reader);
    await subscribed(hub, LIVE_CHANNEL, makeListener().listener);
    const late = makeListener();
    during.tickRead = async () => {
      projection.set(liveStatus(LIVE_CHANNEL));
      await subscribed(hub, LIVE_CHANNEL, late.listener);
    };

    await hub.tick();

    expect(late.received).toEqual([liveStatus(LIVE_CHANNEL)]);
  });

  it("n'envoie rien pour une chaîne qui disparaît de la projection", async () => {
    const projection = makeProjection([
      offlineStatus(LIVE_CHANNEL),
      offlineStatus(OFFLINE_CHANNEL),
    ]);
    const vanishing: { gone: boolean } = { gone: false };
    const reader: LiveStatusReader = {
      read: async (channelIds) =>
        (await projection.reader.read(channelIds)).filter(
          ({ channelId }) => !(vanishing.gone && channelId === LIVE_CHANNEL),
        ),
    };
    const hub = createLiveStatusHub(reader);
    const { received, listener } = makeListener();
    await subscribed(hub, LIVE_CHANNEL, listener);
    const other = makeListener();
    await subscribed(hub, OFFLINE_CHANNEL, other.listener);

    vanishing.gone = true;
    projection.set(liveStatus(OFFLINE_CHANNEL));
    await hub.tick();

    expect(received).toEqual([offlineStatus(LIVE_CHANNEL)]);
    expect(other.received).toEqual([offlineStatus(OFFLINE_CHANNEL), liveStatus(OFFLINE_CHANNEL)]);
  });

  it("envoie au tick un changement du nombre de viewers d'une chaîne en live", async () => {
    const projection = makeProjection([{ ...liveStatus(LIVE_CHANNEL), viewerCount: 3 }]);
    const hub = createLiveStatusHub(projection.reader);
    const { received, listener } = makeListener();
    await subscribed(hub, LIVE_CHANNEL, listener);

    await hub.tick();
    projection.set({ ...liveStatus(LIVE_CHANNEL), viewerCount: 4 });
    await hub.tick();

    expect(received).toEqual([
      { ...liveStatus(LIVE_CHANNEL), viewerCount: 3 },
      { ...liveStatus(LIVE_CHANNEL), viewerCount: 4 },
    ]);
  });
});
