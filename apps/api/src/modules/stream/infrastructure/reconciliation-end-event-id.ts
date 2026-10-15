import { nameBasedUuid } from "../../../platform/name-based-uuid.ts";

const RECONCILIATION_END_NAMESPACE = "3f1c2a8e-6b4d-4c1e-9a57-2d8e0b6f4c91";

export const reconciliationEndEventId = (providerSessionId: string): string =>
  nameBasedUuid({ namespace: RECONCILIATION_END_NAMESPACE, name: providerSessionId });
