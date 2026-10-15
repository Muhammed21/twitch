import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  consumeOnce,
  createStreamConsumerRedis,
  ensureGroup,
  type StreamConsumerError,
  startStreamConsumer,
} from "./stream-consumer.ts";
import { type StreamEvent, toStreamEntry } from "./stream-entry.ts";

const urlOf = (variable: string): string => {
  const url = process.env[variable];
  if (url === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return url;
};

const redis = createStreamConsumerRedis(urlOf("REDIS_URL"));
const streams: string[] = [];

const freshStream = () => {
  const stream = `test.stream-consumer.${randomUUID()}`;
  streams.push(stream);
  return { stream, group: "channel" };
};

const makeEvent = (name = "identity.account.registered") => ({
  id: randomUUID(),
  name,
  version: 1,
  payload: { accountId: randomUUID(), displayName: "Streamer" },
  occurredAt: new Date("2026-10-15T09:30:00.000Z"),
});

const publish = async (stream: string, event = makeEvent()) => {
  await redis.xAdd(stream, "*", toStreamEntry(event));
  return event;
};

const pendingOf = async ({ stream, group }: { stream: string; group: string }) =>
  (await redis.xPending(stream, group)).pending;

const recordingHandler = () => {
  const handled: StreamEvent[] = [];
  return {
    handled,
    handler: async (event: StreamEvent) => {
      handled.push(event);
    },
  };
};

const ignoreErrors = () => {};

const consume = (
  target: { stream: string; group: string },
  options: Partial<Parameters<typeof consumeOnce>[0]> = {},
) =>
  consumeOnce({
    redis,
    ...target,
    consumer: "consommateur-a",
    handlers: {},
    claimIdleMs: 30_000,
    blockMs: 10,
    onError: ignoreErrors,
    ...options,
  });

beforeAll(async () => {
  await redis.connect();
});

afterAll(async () => {
  await Promise.all(streams.map((stream) => redis.del(stream)));
  redis.destroy();
});

describe("consommateur d'un stream Redis (ADR 0034)", () => {
  it("crée son groupe depuis le début du stream et lit les events publiés avant", async () => {
    const target = freshStream();
    const event = await publish(target.stream);
    const { handled, handler } = recordingHandler();

    await ensureGroup({ redis, ...target });
    await consume(target, { handlers: { [event.name]: handler } });

    expect(handled).toEqual([event]);
    expect(await pendingOf(target)).toBe(0);
  });

  it("tolère un groupe déjà créé", async () => {
    const target = freshStream();

    await ensureGroup({ redis, ...target });

    await expect(ensureGroup({ redis, ...target })).resolves.toBeUndefined();
  });

  it("remonte une autre erreur que BUSYGROUP à la création du groupe", async () => {
    const target = freshStream();
    await redis.set(target.stream, "pas un stream");

    await expect(ensureGroup({ redis, ...target })).rejects.toThrow("WRONGTYPE");
  });

  it("ne relit pas un event acquitté", async () => {
    const target = freshStream();
    await ensureGroup({ redis, ...target });
    const event = await publish(target.stream);
    const { handled, handler } = recordingHandler();

    await consume(target, { handlers: { [event.name]: handler } });
    await consume(target, { handlers: { [event.name]: handler } });

    expect(handled).toHaveLength(1);
  });

  it("traite les events dans l'ordre du stream", async () => {
    const target = freshStream();
    await ensureGroup({ redis, ...target });
    const first = await publish(target.stream);
    const second = await publish(target.stream);
    const { handled, handler } = recordingHandler();

    await consume(target, { handlers: { [first.name]: handler } });

    expect(handled.map((event) => event.id)).toEqual([first.id, second.id]);
  });

  it("acquitte sans effet un event qu'aucun handler ne traite", async () => {
    const target = freshStream();
    await ensureGroup({ redis, ...target });
    await publish(target.stream, makeEvent("identity.account.deleted"));
    const { handled, handler } = recordingHandler();

    await consume(target, { handlers: { "identity.account.registered": handler } });

    expect(handled).toEqual([]);
    expect(await pendingOf(target)).toBe(0);
  });

  it("acquitte et signale une entrée illisible", async () => {
    const target = freshStream();
    await ensureGroup({ redis, ...target });
    const entryId = await redis.xAdd(target.stream, "*", { name: "sans le reste" });
    const onError = vi.fn<(failure: StreamConsumerError) => void>();

    await consume(target, { onError });

    expect(onError).toHaveBeenCalledExactlyOnceWith({
      stream: target.stream,
      entryId,
      error: new Error("entrée illisible"),
    });
    expect(await pendingOf(target)).toBe(0);
  });

  it("laisse en attente un event dont le handler échoue, et le signale", async () => {
    const target = freshStream();
    await ensureGroup({ redis, ...target });
    const event = await publish(target.stream);
    const failure = new Error("base indisponible");
    const onError = vi.fn<(failure: StreamConsumerError) => void>();

    await consume(target, {
      handlers: { [event.name]: () => Promise.reject(failure) },
      onError,
    });

    expect(onError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ stream: target.stream, error: failure }),
    );
    expect(await pendingOf(target)).toBe(1);
  });

  it("reprend un event resté en attente chez un consommateur arrêté, passé le délai", async () => {
    const target = freshStream();
    await ensureGroup({ redis, ...target });
    const event = await publish(target.stream);
    await redis.xReadGroup(target.group, "consommateur-arrete", { key: target.stream, id: ">" });
    const { handled, handler } = recordingHandler();
    await sleep(60);

    await consume(target, {
      consumer: "consommateur-b",
      handlers: { [event.name]: handler },
      claimIdleMs: 50,
    });

    expect(handled).toEqual([event]);
    expect(await pendingOf(target)).toBe(0);
  });

  it("ne reprend pas un event en attente avant le délai", async () => {
    const target = freshStream();
    await ensureGroup({ redis, ...target });
    const event = await publish(target.stream);
    await redis.xReadGroup(target.group, "consommateur-actif", { key: target.stream, id: ">" });
    const { handled, handler } = recordingHandler();

    await consume(target, {
      consumer: "consommateur-b",
      handlers: { [event.name]: handler },
      claimIdleMs: 30_000,
    });

    expect(handled).toEqual([]);
    expect(await pendingOf(target)).toBe(1);
  });

  it("consomme en continu jusqu'à l'arrêt", async () => {
    const target = freshStream();
    const { handled, handler } = recordingHandler();
    const consumer = startStreamConsumer({
      redis,
      ...target,
      consumer: "consommateur-a",
      handlers: { "identity.account.registered": handler },
      claimIdleMs: 30_000,
      blockMs: 50,
      onError: ignoreErrors,
    });

    const first = await publish(target.stream);
    await vi.waitFor(() => expect(handled).toEqual([first]));
    await consumer.stop();
    await publish(target.stream);
    await sleep(150);

    expect(handled).toEqual([first]);
  });

  it("recrée son groupe quand le stream a disparu", async () => {
    const target = freshStream();
    const { handled, handler } = recordingHandler();
    const consumer = startStreamConsumer({
      redis,
      ...target,
      consumer: "consommateur-a",
      handlers: { "identity.account.registered": handler },
      claimIdleMs: 30_000,
      blockMs: 50,
      onError: ignoreErrors,
    });
    await vi.waitFor(async () => expect(await redis.exists(target.stream)).toBe(1));

    await redis.del(target.stream);
    const event = await publish(target.stream);

    await vi.waitFor(() => expect(handled).toEqual([event]));
    await consumer.stop();
  });

  it("attend blockMs avant de réessayer quand une passe échoue", async () => {
    const target = freshStream();
    const onError = vi.fn<(failure: StreamConsumerError) => void>();
    const consumer = startStreamConsumer({
      redis,
      ...target,
      consumer: "consommateur-a",
      handlers: {},
      claimIdleMs: 30_000,
      blockMs: 100,
      onError,
    });
    await redis.del(target.stream);
    await redis.set(target.stream, "pas un stream");

    await sleep(350);
    await consumer.stop();

    expect(onError).toHaveBeenCalledWith({
      stream: target.stream,
      entryId: "",
      error: expect.objectContaining({ message: expect.stringContaining("WRONGTYPE") }),
    });
    expect(onError.mock.calls.length).toBeLessThanOrEqual(5);
  });

  it("s'arrête sans attendre la fin de la pause qui suit un échec", async () => {
    const target = freshStream();
    await redis.set(target.stream, "pas un stream");
    const consumer = startStreamConsumer({
      redis,
      ...target,
      consumer: "consommateur-a",
      handlers: {},
      claimIdleMs: 30_000,
      blockMs: 5000,
      onError: ignoreErrors,
    });
    await sleep(100);

    const stopped = await Promise.race([
      consumer.stop().then(() => "arrêté"),
      sleep(1000).then(() => "toujours en pause"),
    ]);

    expect(stopped).toBe("arrêté");
  });

  it("se présente à Redis sous le nom api-stream-consumer", async () => {
    expect(await redis.clientList()).toContainEqual(
      expect.objectContaining({ name: "api-stream-consumer" }),
    );
  });
});
