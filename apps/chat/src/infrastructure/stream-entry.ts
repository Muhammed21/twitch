import { z } from "zod";

export type StreamEvent = {
  readonly name: string;
  readonly version: number;
  readonly occurredAt: Date;
  readonly payload: unknown;
};

const StreamEntry = z.looseObject({
  name: z.string().min(1),
  version: z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .transform(Number),
  occurredAt: z.iso.datetime().transform((value) => new Date(value)),
  payload: z.string(),
});

const readJson = (raw: string): { readonly value: unknown } | null => {
  try {
    const value: unknown = JSON.parse(raw);
    return { value };
  } catch {
    return null;
  }
};

export const parseStreamEntry = (message: Readonly<Record<string, string>>): StreamEvent | null => {
  const entry = StreamEntry.safeParse(message);
  if (!entry.success) {
    return null;
  }
  const payload = readJson(entry.data.payload);
  if (payload === null) {
    return null;
  }
  const { name, version, occurredAt } = entry.data;
  return { name, version, occurredAt, payload: payload.value };
};

const contextOf = (eventName: string): string => eventName.slice(0, eventName.indexOf("."));

export const eventStreamsOf = (eventNames: readonly string[]): readonly string[] =>
  [...new Set(eventNames.map((name) => `events.${contextOf(name)}`))].toSorted();
