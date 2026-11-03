import type { SaturationLimits } from "../chat-server.ts";

export const SATURATION_LIMITS: SaturationLimits = { maxPackets: 100, closeAfterMs: 10_000 };
