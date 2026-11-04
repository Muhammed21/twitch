import { z } from "zod";

import { Uuid } from "../conventions/schemas.ts";

export const ImageUpload = z
  .looseObject({
    uploadId: Uuid,
    uploadUrl: z.url({ protocol: /^https?$/ }),
    headers: z.record(z.string(), z.string()),
    expiresAt: z.iso.datetime(),
  })
  .meta({ id: "ImageUpload" });
