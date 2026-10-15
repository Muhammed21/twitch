import { z } from "zod";

import { Uuid } from "@repo/contracts";
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

export type StreamEvent = {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly occurredAt: Date;
  readonly payload: unknown;
};

const readJson = (raw: string): { readonly value: unknown } | null => {
  try {
    const value: unknown = JSON.parse(raw);
    return { value };
  } catch {
    return null;
  }
};

const StreamEntrySchema = z.looseObject({
  id: Uuid,
  name: z.string().min(1),
  version: z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .transform(Number),
  occurredAt: z.iso.datetime().transform((value) => new Date(value)),
  payload: z.string(),
});

export const parseStreamEntry = (message: Readonly<Record<string, string>>): StreamEvent | null => {
  const parsed = StreamEntrySchema.safeParse(message);
  if (!parsed.success) {
    return null;
  }
  const payload = readJson(parsed.data.payload);
  if (payload === null) {
    return null;
  }
  const { id, name, version, occurredAt } = parsed.data;
  return { id, name, version, occurredAt, payload: payload.value };
};
