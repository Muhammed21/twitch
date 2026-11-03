import { z } from "zod";

export type StreamEvent = {
  readonly name: string;
  readonly version: number;
  readonly payload: unknown;
};

const StreamEntry = z.looseObject({
  name: z.string().min(1),
  version: z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .transform(Number),
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
  return { name: entry.data.name, version: entry.data.version, payload: payload.value };
};
