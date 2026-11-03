import { z } from "zod";

import { err, ok, type Result } from "@repo/result";

export const SESSION_REVOKED_CHANNEL = "identity.session.revoked";

const SessionRevocation = z.object({ userId: z.string(), sids: z.array(z.string()) });

export type SessionRevocation = z.infer<typeof SessionRevocation>;

const jsonOf = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

export const sessionRevocationOf = (message: string): Result<SessionRevocation, "malformed"> => {
  const parsed = SessionRevocation.safeParse(jsonOf(message));
  return parsed.success ? ok(parsed.data) : err("malformed");
};
