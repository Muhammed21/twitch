import type { Pool, PoolClient } from "pg";

import { Prisma } from "./generated/prisma/client.ts";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type OutboxEvent = {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly payload: JsonValue;
  readonly occurredAt: Date;
};

export type TableRef = {
  readonly schema: string;
  readonly table: string;
};

export type OutboxPublisher = (event: OutboxEvent) => Promise<void>;

export type SqlExecutor = {
  $executeRaw: (query: Prisma.Sql) => PromiseLike<number>;
};

const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 5 * 60 * 1000;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const backoffDelay = (attempts: number): number =>
  Math.min(BASE_DELAY_MS * 2 ** (attempts - 1), MAX_DELAY_MS);

export const qualifiedTable = ({ schema, table }: TableRef): string => {
  if (!IDENTIFIER.test(schema) || !IDENTIFIER.test(table)) {
    throw new Error(`Table invalide : ${schema}.${table}`);
  }
  return `"${schema}"."${table}"`;
};

const utc = (date: Date) => Prisma.sql`(${date.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;

export const appendToOutbox = async (
  tx: SqlExecutor,
  { outbox, event }: { outbox: TableRef; event: OutboxEvent },
): Promise<void> => {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO ${Prisma.raw(qualifiedTable(outbox))} ("id", "name", "version", "payload", "occurredAt", "nextAttemptAt")
    VALUES (${event.id}::uuid, ${event.name}, ${event.version}, ${JSON.stringify(event.payload)}::jsonb, ${utc(event.occurredAt)}, ${utc(event.occurredAt)})
  `);
};

export const alreadyProcessed = async (
  tx: SqlExecutor,
  {
    processedEvents,
    eventId,
    handler,
  }: { processedEvents: TableRef; eventId: string; handler: string },
): Promise<boolean> => {
  const inserted = await tx.$executeRaw(Prisma.sql`
    INSERT INTO ${Prisma.raw(qualifiedTable(processedEvents))} ("eventId", "handlerName")
    VALUES (${eventId}::uuid, ${handler})
    ON CONFLICT DO NOTHING
  `);
  return inserted === 0;
};

type OutboxRow = {
  id: string;
  name: string;
  version: number;
  payload: JsonValue;
  occurredAt: Date;
  attempts: number;
};

const toEvent = ({ id, name, version, payload, occurredAt }: OutboxRow): OutboxEvent => ({
  id,
  name,
  version,
  payload,
  occurredAt,
});

const failureOf = (publish: OutboxPublisher, event: OutboxEvent): Promise<string | undefined> =>
  publish(event).then(
    () => undefined,
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );

const settle = async ({
  client,
  table,
  row,
  publish,
  at,
}: {
  client: PoolClient;
  table: string;
  row: OutboxRow;
  publish: OutboxPublisher;
  at: Date;
}): Promise<string | undefined> => {
  const failure = await failureOf(publish, toEvent(row));
  await (failure === undefined
    ? client.query(
        `UPDATE ${table} SET "publishedAt" = ($2::timestamptz AT TIME ZONE 'UTC') WHERE "id" = $1`,
        [row.id, at.toISOString()],
      )
    : client.query(
        `UPDATE ${table}
            SET "attempts" = "attempts" + 1,
                "nextAttemptAt" = ($2::timestamptz AT TIME ZONE 'UTC'),
                "lastError" = $3
          WHERE "id" = $1`,
        [row.id, new Date(at.getTime() + backoffDelay(row.attempts + 1)).toISOString(), failure],
      ));
  return failure;
};

export const relayOutboxBatch = async ({
  pool,
  outbox,
  publish,
  batchSize = 100,
  now = () => new Date(),
}: {
  pool: Pool;
  outbox: TableRef;
  publish: OutboxPublisher;
  batchSize?: number;
  now?: () => Date;
}): Promise<{ published: number; failed: number }> => {
  const table = qualifiedTable(outbox);
  const at = now();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<OutboxRow>(
      `SELECT "id", "name", "version", "payload", "attempts",
              "occurredAt" AT TIME ZONE 'UTC' AS "occurredAt"
         FROM ${table}
        WHERE "publishedAt" IS NULL
          AND "nextAttemptAt" <= ($1::timestamptz AT TIME ZONE 'UTC')
        ORDER BY "occurredAt", "id"
        LIMIT $2
        FOR UPDATE SKIP LOCKED`,
      [at.toISOString(), batchSize],
    );
    const failures: (string | undefined)[] = [];
    for (const row of rows) {
      failures.push(await settle({ client, table, row, publish, at }));
    }
    await client.query("COMMIT");
    const failed = failures.filter((failure) => failure !== undefined).length;
    return { published: failures.length - failed, failed };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
