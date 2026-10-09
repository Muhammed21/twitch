import { createZodDto } from "nestjs-zod";
import type { z } from "zod";

import { checkResponseSchema } from "@repo/contracts";

export const responseDto = <Schema extends z.ZodType>(schema: Schema) => {
  const violations = checkResponseSchema("ResponseDto", schema);
  if (violations.length > 0) {
    throw new Error(
      violations.map((violation) => `${violation.rule} ${violation.message}`).join("\n"),
    );
  }
  return createZodDto(schema);
};
