import { z } from "zod";

export const StreamKey = z
  .looseObject({
    streamKey: z.string().min(1),
    ingestUrl: z.url(),
  })
  .meta({ id: "StreamKey" });
