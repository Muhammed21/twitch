import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  alreadyProcessed,
  appendToOutbox,
  createContextClient,
  type OutboxEvent,
  type OutboxPublisher,
  relayOutboxBatch,
} from "./index.ts";

const SCHEMA = `outbox_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;

const urlOf = (variable: string): string => {
  const url = process.env[variable];
  if (url === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return url;
};

const asMigrator = async (sql: string) => {
  const client = new Client({ connectionString: urlOf("DATABASE_URL_MIGRATOR") });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
};

const db = createContextClient({ context: "video" });
const relayPool = new Pool({ connectionString: urlOf("DATABASE_URL_OUTBOX_RELAY") });

const makeEvent = (overrides: Partial<OutboxEvent> = {}): OutboxEvent => ({
  id: randomUUID(),
  name: "video.stream.started",
  version: 1,
  payload: { streamId: randomUUID() },
  occurredAt: new Date("2026-10-09T12:00:00.000Z"),
  ...overrides,
});

const freshOutbox = async () => {
  const table = `TestOutbox_${randomUUID().replaceAll("-", "").slice(0, 8)}`;
  await asMigrator(`
    CREATE TABLE "${SCHEMA}"."${table}" (
      "id" uuid PRIMARY KEY,
      "name" text NOT NULL,
      "version" integer NOT NULL,
      "payload" jsonb NOT NULL,
      "occurredAt" timestamp(3) NOT NULL,
      "publishedAt" timestamp(3),
      "attempts" integer NOT NULL DEFAULT 0,
      "nextAttemptAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "lastError" text
    );
    GRANT SELECT, INSERT ON "${SCHEMA}"."${table}" TO app_video;
    GRANT SELECT, UPDATE ON "${SCHEMA}"."${table}" TO app_outbox_relay;
  `);
  return { schema: SCHEMA, table };
};

const freshProcessedEvents = async () => {
  const table = `TestProcessedEvent_${randomUUID().replaceAll("-", "").slice(0, 8)}`;
  await asMigrator(`
    CREATE TABLE "${SCHEMA}"."${table}" (
      "eventId" uuid NOT NULL,
      "handlerName" text NOT NULL,
      "processedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY ("eventId", "handlerName")
    );
    GRANT SELECT, INSERT ON "${SCHEMA}"."${table}" TO app_video;
  `);
  return { schema: SCHEMA, table };
};

const rowOf = async (outbox: { schema: string; table: string }, id: string) => {
  const client = new Client({ connectionString: urlOf("DATABASE_URL_MIGRATOR") });
  await client.connect();
  try {
    const { rows } = await client.query<{
      attempts: number;
      lastError: string | null;
      published: boolean;
    }>(
      `SELECT "attempts", "lastError", "publishedAt" IS NOT NULL AS "published"
         FROM "${outbox.schema}"."${outbox.table}" WHERE "id" = $1`,
      [id],
    );
    return rows[0];
  } finally {
    await client.end();
  }
};

const brokerDown: OutboxPublisher = async () => {
  throw new Error("broker indisponible");
};

const rejectsWithText: OutboxPublisher = () => Promise.reject("timeout");

const recordingPublisher = () => {
  const published: OutboxEvent[] = [];
  const publish: OutboxPublisher = async (event) => {
    published.push(event);
  };
  return { published, publish };
};

const appendAll = (outbox: { schema: string; table: string }, events: readonly OutboxEvent[]) =>
  db.$transaction(async (tx) => {
    for (const event of events) {
      await appendToOutbox(tx, { outbox, event });
    }
  });

beforeAll(async () => {
  await asMigrator(`
    CREATE SCHEMA "${SCHEMA}";
    GRANT USAGE ON SCHEMA "${SCHEMA}" TO app_video, app_outbox_relay;
  `);
});

afterAll(async () => {
  await db.$disconnect();
  await relayPool.end();
  await asMigrator(`DROP SCHEMA "${SCHEMA}" CASCADE`);
});

describe("outbox", () => {
  it("publie un événement écrit dans une transaction validée, à l'identique", async () => {
    const outbox = await freshOutbox();
    const event = makeEvent({ payload: { streamId: "s-1", viewers: 3, tags: ["fr"] } });
    const { published, publish } = recordingPublisher();

    await appendAll(outbox, [event]);
    await relayOutboxBatch({ pool: relayPool, outbox, publish });

    expect(published).toEqual([event]);
    expect(await rowOf(outbox, event.id)).toEqual({
      attempts: 0,
      lastError: null,
      published: true,
    });
  });

  it("ne publie jamais un événement écrit dans une transaction annulée", async () => {
    const outbox = await freshOutbox();
    const { published, publish } = recordingPublisher();

    await expect(
      db.$transaction(async (tx) => {
        await appendToOutbox(tx, { outbox, event: makeEvent() });
        throw new Error("échec métier");
      }),
    ).rejects.toThrow("échec métier");
    await relayOutboxBatch({ pool: relayPool, outbox, publish });

    expect(published).toEqual([]);
  });

  it("publie dans l'ordre d'occurrence, et une seule fois", async () => {
    const outbox = await freshOutbox();
    const later = makeEvent({ occurredAt: new Date("2026-10-09T12:00:02.000Z") });
    const earlier = makeEvent({ occurredAt: new Date("2026-10-09T12:00:01.000Z") });
    const { published, publish } = recordingPublisher();

    await appendAll(outbox, [later, earlier]);
    await relayOutboxBatch({ pool: relayPool, outbox, publish });
    await relayOutboxBatch({ pool: relayPool, outbox, publish });

    expect(published.map((event) => event.id)).toEqual([earlier.id, later.id]);
  });

  it("deux relais en parallèle publient chaque événement exactement une fois", async () => {
    const outbox = await freshOutbox();
    const events = Array.from({ length: 40 }, () => makeEvent());
    const { published, publish } = recordingPublisher();
    const slowPublish: OutboxPublisher = async (event) => {
      await sleep(5);
      await publish(event);
    };

    await appendAll(outbox, events);
    await Promise.all([
      relayOutboxBatch({ pool: relayPool, outbox, publish: slowPublish, batchSize: 10 }),
      relayOutboxBatch({ pool: relayPool, outbox, publish: slowPublish, batchSize: 10 }),
      relayOutboxBatch({ pool: relayPool, outbox, publish: slowPublish, batchSize: 10 }),
      relayOutboxBatch({ pool: relayPool, outbox, publish: slowPublish, batchSize: 10 }),
      relayOutboxBatch({ pool: relayPool, outbox, publish: slowPublish, batchSize: 10 }),
    ]);

    const ids = published.map((event) => event.id);
    expect(ids.toSorted()).toEqual(events.map((event) => event.id).toSorted());
  });

  it("garde un événement dont la publication échoue, et le republie après un délai croissant", async () => {
    const outbox = await freshOutbox();
    const event = makeEvent();
    const start = new Date("2026-10-09T12:00:00.000Z");
    const at = (seconds: number) => () => new Date(start.getTime() + seconds * 1000);
    const { published, publish } = recordingPublisher();

    await appendAll(outbox, [event]);

    expect(
      await relayOutboxBatch({ pool: relayPool, outbox, publish: brokerDown, now: at(0) }),
    ).toEqual({ published: 0, failed: 1 });
    expect(await relayOutboxBatch({ pool: relayPool, outbox, publish, now: at(0.5) })).toEqual({
      published: 0,
      failed: 0,
    });
    expect(
      await relayOutboxBatch({ pool: relayPool, outbox, publish: brokerDown, now: at(1) }),
    ).toEqual({ published: 0, failed: 1 });
    expect(await relayOutboxBatch({ pool: relayPool, outbox, publish, now: at(2.5) })).toEqual({
      published: 0,
      failed: 0,
    });
    expect(await relayOutboxBatch({ pool: relayPool, outbox, publish, now: at(3) })).toEqual({
      published: 1,
      failed: 0,
    });
    expect(published.map((item) => item.id)).toEqual([event.id]);
  });
});

describe("échec de publication", () => {
  it("compte la tentative et garde le message de l'erreur", async () => {
    const outbox = await freshOutbox();
    const event = makeEvent();

    await appendAll(outbox, [event]);
    await relayOutboxBatch({ pool: relayPool, outbox, publish: brokerDown });

    expect(await rowOf(outbox, event.id)).toEqual({
      attempts: 1,
      lastError: "broker indisponible",
      published: false,
    });
  });

  it("enregistre un échec qui n'est pas une Error sous sa forme texte", async () => {
    const outbox = await freshOutbox();
    const event = makeEvent();

    await appendAll(outbox, [event]);
    await relayOutboxBatch({ pool: relayPool, outbox, publish: rejectsWithText });

    expect(await rowOf(outbox, event.id)).toEqual({
      attempts: 1,
      lastError: "timeout",
      published: false,
    });
  });
});

describe("erreur SQL pendant un lot", () => {
  it("annule le lot, propage l'erreur et rend une connexion réutilisable", async () => {
    const outbox = await freshOutbox();
    await asMigrator(`REVOKE UPDATE ON "${outbox.schema}"."${outbox.table}" FROM app_outbox_relay`);
    const singleConnection = new Pool({
      connectionString: urlOf("DATABASE_URL_OUTBOX_RELAY"),
      max: 1,
    });
    const { publish } = recordingPublisher();

    try {
      await expect(
        relayOutboxBatch({ pool: singleConnection, outbox, publish }),
      ).rejects.toMatchObject({ code: "42501" });
      const { rows } = await singleConnection.query<{ ok: number }>("SELECT 1 AS ok");
      expect(rows).toEqual([{ ok: 1 }]);
    } finally {
      await singleConnection.end();
    }
  });
});

describe("alreadyProcessed", () => {
  it("laisse passer un événement la première fois, puis l'ignore pour ce handler", async () => {
    const processedEvents = await freshProcessedEvents();
    const eventId = randomUUID();
    const check = (handler: string) =>
      db.$transaction((tx) => alreadyProcessed(tx, { processedEvents, eventId, handler }));

    expect(await check("chat.apply-timeout")).toBe(false);
    expect(await check("chat.apply-timeout")).toBe(true);
    expect(await check("notification.notify-followers")).toBe(false);
  });

  it("oublie le passage d'un handler dont la transaction est annulée", async () => {
    const processedEvents = await freshProcessedEvents();
    const eventId = randomUUID();
    const handler = "chat.apply-timeout";

    await expect(
      db.$transaction(async (tx) => {
        await alreadyProcessed(tx, { processedEvents, eventId, handler });
        throw new Error("échec du handler");
      }),
    ).rejects.toThrow("échec du handler");

    expect(
      await db.$transaction((tx) => alreadyProcessed(tx, { processedEvents, eventId, handler })),
    ).toBe(false);
  });
});
