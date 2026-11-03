import { z } from "zod";

export const Playback = z
  .looseObject({
    playbackUrl: z.url({ protocol: /^https?$/ }),
  })
  .meta({ id: "Playback" });
