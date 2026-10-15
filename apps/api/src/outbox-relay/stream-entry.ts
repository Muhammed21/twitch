import type { OutboxEvent, TableRef } from "@repo/db";

export const STREAM_MAX_LENGTH = 100_000;

export type StreamEntry = {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly occurredAt: string;
  readonly payload: string;
};

export const streamOf = (outbox: TableRef): string => `events.${outbox.schema}`;

export const toStreamEntry = (event: OutboxEvent): StreamEntry => ({
  id: event.id,
  name: event.name,
  version: String(event.version),
  occurredAt: event.occurredAt.toISOString(),
  payload: JSON.stringify(event.payload),
});
