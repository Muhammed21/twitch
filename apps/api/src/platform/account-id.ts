import { Uuid } from "@repo/contracts";

export const BodyAccountId = Uuid.transform((id) => id.toLowerCase());
