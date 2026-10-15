import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { TableRef } from "@repo/db";

import {
  createRelayRedis,
  OUTBOXES,
  type RelayError,
  relayOutboxes,
  startOutboxRelay,
} from "./outbox-relay.ts";
import { streamOf } from "./stream-entry.ts";

const SCHEMA = `relay_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;

const urlOf = (variable: string): string => {
  const url = process.env[variable];
  if (url === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return url;
};

const asMigrator = async <T>(run: (client: Client) => Promise<T>): Promise<T> => {
  const client = new Client({ connectionString: urlOf("DATABASE_URL_MIGRATOR") });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
};

const pool = new Pool({ connectionString: urlOf("DATABASE_URL_OUTBOX_RELAY") });
const redis = createRelayRedis(urlOf("REDIS_URL"));

const IDENTITY_OUTBOX: TableRef = { schema: "identity", table: "IdentityOutbox" };

const freshOutbox = async (): Promise<TableRef> => {
  const outbox = {
    schema: SCHEMA,
    table: `Outbox_${randomUUID().replaceAll("-", "").slice(0, 8)}`,
  };
  await asMigrator((client) =>
    client.query(`
      CREATE TABLE "${outbox.schema}"."${outbox.table}" (
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
      GRANT SELECT, UPDATE ON "${outbox.schema}"."${outbox.table}" TO app_outbox_relay;
    `),
  );
  return outbox;
};

const seedEvent = async (outbox: TableRef) => {
  const event = {
    id: randomUUID(),
    name: "identity.account.registered",
    payload: { accountId: randomUUID() },
  };
  await asMigrator((client) =>
    client.query(
      `INSERT INTO "${outbox.schema}"."${outbox.table}" ("id", "name", "version", "payload", "occurredAt")
       VALUES ($1, $2, 1, $3, '2026-10-15 09:30:00')`,
      [event.id, event.name, JSON.stringify(event.payload)],
    ),
  );
  return event;
};

const rowOf = (outbox: TableRef, id: string) =>
  asMigrator(async (client) => {
    const { rows } = await client.query<{
      attempts: number;
      lastError: string | null;
      published: boolean;
      reprogrammed: boolean;
    }>(
      `SELECT "attempts", "lastError", "publishedAt" IS NOT NULL AS "published",
              "nextAttemptAt" > (now() AT TIME ZONE 'UTC') AS "reprogrammed"
         FROM "${outbox.schema}"."${outbox.table}" WHERE "id" = $1`,
      [id],
    );
    return rows[0];
  });

const entriesOf = async (stream: string) =>
  (await redis.xRevRange(stream, "+", "-", { COUNT: 1000 })).map((entry) => entry.message);

const ignoreErrors = () => {};

beforeAll(async () => {
  await redis.connect();
  await asMigrator((client) =>
    client.query(`
      CREATE SCHEMA "${SCHEMA}";
      GRANT USAGE ON SCHEMA "${SCHEMA}" TO app_outbox_relay;
    `),
  );
});

afterAll(async () => {
  await redis.del(streamOf({ schema: SCHEMA, table: "" }));
  redis.destroy();
  await pool.end();
  await asMigrator((client) => client.query(`DROP SCHEMA "${SCHEMA}" CASCADE`));
});

describe("relais de l'outbox vers Redis Streams", () => {
  it("relaie l'outbox d'identity", () => {
    expect(OUTBOXES).toContainEqual(IDENTITY_OUTBOX);
  });

  it("publie un event de l'outbox d'identity sur events.identity, puis le marque publié", async () => {
    const event = await seedEvent(IDENTITY_OUTBOX);

    await relayOutboxes({ pool, redis, outboxes: [IDENTITY_OUTBOX], onError: ignoreErrors });

    expect(await entriesOf("events.identity")).toContainEqual({
      id: event.id,
      name: event.name,
      version: "1",
      occurredAt: "2026-10-15T09:30:00.000Z",
      payload: JSON.stringify(event.payload),
    });
    expect(await rowOf(IDENTITY_OUTBOX, event.id)).toMatchObject({ published: true });
  });

  it("reprogramme un event dont la publication échoue, sans le marquer publié", async () => {
    const outbox = await freshOutbox();
    const event = await seedEvent(outbox);
    await redis.set(streamOf(outbox), "pas un stream");

    try {
      await relayOutboxes({ pool, redis, outboxes: [outbox], onError: ignoreErrors });
    } finally {
      await redis.del(streamOf(outbox));
    }

    expect(await rowOf(outbox, event.id)).toEqual({
      attempts: 1,
      lastError: expect.stringContaining("WRONGTYPE"),
      published: false,
      reprogrammed: true,
    });
  });

  it("signale une outbox illisible et relaie quand même les suivantes", async () => {
    const unreadable: TableRef = { schema: SCHEMA, table: "OutboxAbsente" };
    const outbox = await freshOutbox();
    const event = await seedEvent(outbox);
    const onError = vi.fn<(failure: RelayError) => void>();

    await relayOutboxes({ pool, redis, outboxes: [unreadable, outbox], onError });

    expect(onError).toHaveBeenCalledExactlyOnceWith({
      outbox: unreadable,
      error: expect.objectContaining({ message: expect.stringContaining("OutboxAbsente") }),
    });
    expect(await rowOf(outbox, event.id)).toMatchObject({ published: true });
  });

  it("relaie en continu jusqu'à l'arrêt, puis ne publie plus rien", async () => {
    const outbox = await freshOutbox();
    const relay = startOutboxRelay({
      pool,
      redis,
      outboxes: [outbox],
      intervalMs: 20,
      onError: ignoreErrors,
    });

    const first = await seedEvent(outbox);
    await vi.waitFor(async () =>
      expect(await rowOf(outbox, first.id)).toMatchObject({ published: true }),
    );
    await relay.stop();
    const second = await seedEvent(outbox);
    await sleep(100);

    expect(await rowOf(outbox, second.id)).toMatchObject({ published: false, attempts: 0 });
  });

  it("s'arrête sans attendre la fin de l'intervalle", async () => {
    const relay = startOutboxRelay({
      pool,
      redis,
      outboxes: [await freshOutbox()],
      intervalMs: 60_000,
      onError: ignoreErrors,
    });
    await sleep(50);

    const stopped = await Promise.race([
      relay.stop().then(() => "arrêté"),
      sleep(2000).then(() => "toujours en attente"),
    ]);

    expect(stopped).toBe("arrêté");
  });

  it("coupe le stream à environ 100 000 entrées (ADR 0034)", async () => {
    const outbox = await freshOutbox();
    const stream = streamOf(outbox);
    for (const chunk of Array.from({ length: 21 }, (_, index) => index)) {
      const batch = redis.multi();
      for (const _ of Array.from({ length: 5000 }, () => chunk)) {
        batch.xAdd(stream, "*", { remplissage: "1" });
      }
      await batch.exec();
    }
    await seedEvent(outbox);

    await relayOutboxes({ pool, redis, outboxes: [outbox], onError: ignoreErrors });

    const length = await redis.xLen(stream);
    expect(length).toBeGreaterThanOrEqual(100_000);
    expect(length).toBeLessThanOrEqual(100_100);
  });

  it("se présente à Redis sous le nom outbox-relay", async () => {
    expect(await redis.clientList()).toContainEqual(
      expect.objectContaining({ name: "outbox-relay" }),
    );
  });
});
