import type { TurboProfiles } from "../../application/ports.ts";

export const NO_TURBO: TurboProfiles = {
  turboOf: async () => ({ expiresAt: null, chatColor: null }),
};
