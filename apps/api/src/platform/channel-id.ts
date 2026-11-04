import { Uuid } from "@repo/contracts";

export const PathChannelId = Uuid.transform((id) => id.toLowerCase());

export const pathChannelIdOf = (raw: string): string | undefined => {
  const parsed = PathChannelId.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
};
