import { z } from "zod";

export const contexts = [
  "identity",
  "channel",
  "stream",
  "chat",
  "moderation",
  "discovery",
  "monetization",
  "notification",
  "video",
] as const;

export const contextSchema = z.enum(contexts);

export type Context = z.infer<typeof contextSchema>;
