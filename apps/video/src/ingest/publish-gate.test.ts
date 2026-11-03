import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { inMemoryVideoStore } from "../control-plane/in-memory-video-store.ts";
import { makeVideoChannel } from "../control-plane/testing/video-store.contract.ts";
import { stop } from "../domain/ingest.ts";
import { createPublishGate } from "./publish-gate.ts";

const STARTED_AT = new Date("2026-11-04T20:00:00.000Z");
const ENDED_AT = new Date("2026-11-04T21:00:00.000Z");

const seedChannel = async () => {
  const store = inMemoryVideoStore();
  const channel = makeVideoChannel();
  await store.saveChannel(channel);
  const clock = { now: STARTED_AT };
  const gate = createPublishGate({ store, newId: randomUUID, now: () => clock.now });
  return { store, channel, gate, clock };
};

describe("publish RTMP : la clé ouvre la session live du canal (ADR 0031, §3)", () => {
  it("accepte la clé du canal, ouvre une session live et écrit stream.started", async () => {
    const { store, channel, gate } = await seedChannel();

    const publication = await gate(channel.streamKey);

    const [live] = await store.liveSessions();
    expect(publication).toBeDefined();
    expect(live).toMatchObject({ state: "live", channelId: channel.id, startedAt: STARTED_AT });
    expect(await store.eventsOf(live?.id ?? "")).toEqual([
      expect.objectContaining({
        type: "stream.started",
        channelId: channel.id,
        sessionId: live?.id,
        occurredAt: STARTED_AT.toISOString(),
      }),
    ]);
  });

  it("refuse une clé inconnue sans ouvrir de session", async () => {
    const { store, channel, gate } = await seedChannel();

    expect(await gate(`${channel.streamKey.slice(0, -1)}0`)).toBeUndefined();
    expect(await gate("")).toBeUndefined();
    expect(await store.liveSessions()).toEqual([]);
  });

  it("refuse une clé différente de celle du canal rendu par le dépôt, même s'il la croit bonne", async () => {
    const { store, channel } = await seedChannel();
    const gate = createPublishGate({
      store: { ...store, findChannelByStreamKey: async () => channel },
      newId: randomUUID,
      now: () => STARTED_AT,
    });

    expect(await gate(makeVideoChannel().streamKey)).toBeUndefined();
    expect(await store.liveSessions()).toEqual([]);
  });

  it("refuse l'ancienne clé après une rotation", async () => {
    const { store, channel, gate } = await seedChannel();
    await store.saveChannel({ ...channel, streamKey: makeVideoChannel().streamKey });

    expect(await gate(channel.streamKey)).toBeUndefined();
    expect(await store.liveSessions()).toEqual([]);
  });

  it("refuse un second publisher sur un canal déjà en direct, sans toucher la session ouverte", async () => {
    const { store, channel, gate } = await seedChannel();
    await gate(channel.streamKey);
    const before = await store.liveSessions();

    expect(await gate(channel.streamKey)).toBeUndefined();
    expect(await store.liveSessions()).toEqual(before);
    expect(await store.eventsOf(before[0]?.id ?? "")).toHaveLength(1);
  });

  it("ouvre la session d'un canal même quand un autre canal est en direct", async () => {
    const { store, channel, gate } = await seedChannel();
    const other = makeVideoChannel();
    await store.saveChannel(other);
    await gate(other.streamKey);

    expect(await gate(channel.streamKey)).toBeDefined();
    const channelIds = (await store.liveSessions()).map(({ channelId }) => channelId);
    expect(channelIds).toHaveLength(2);
    expect(channelIds).toEqual(expect.arrayContaining([channel.id, other.id]));
  });

  it("termine la session à la fin de la publication et écrit stream.ended", async () => {
    const { store, channel, gate, clock } = await seedChannel();
    const publication = await gate(channel.streamKey);
    const [live] = await store.liveSessions();
    clock.now = ENDED_AT;

    await publication?.end();

    expect(await store.liveSessions()).toEqual([]);
    expect(
      (await store.eventsOf(live?.id ?? "")).map(({ type, occurredAt }) => [type, occurredAt]),
    ).toEqual([
      ["stream.started", STARTED_AT.toISOString()],
      ["stream.ended", ENDED_AT.toISOString()],
    ]);
  });

  it("n'écrit rien de plus à la fin d'une publication dont la session a déjà été arrêtée", async () => {
    const { store, channel, gate } = await seedChannel();
    const publication = await gate(channel.streamKey);
    const [live] = await store.liveSessions();
    const stopped = live === undefined ? undefined : stop(live, ENDED_AT);
    if (stopped?.ok !== true) {
      throw new Error("session live attendue");
    }
    await store.saveSession(stopped.value, []);

    await publication?.end();

    expect((await store.eventsOf(stopped.value.id)).map(({ type }) => type)).toEqual([
      "stream.started",
    ]);
  });
});
