import { describe, expect, it } from "vitest";

import { reconciliationEndEventId } from "./reconciliation-end-event-id.ts";

describe("identifiant de la fin publiée par la réconciliation", () => {
  it("reste le même d'une version à l'autre, pour que deux versions de l'API déployées ensemble ne publient qu'une fin", () => {
    expect(reconciliationEndEventId("provider-session-1")).toBe(
      "2bd53242-8231-58ca-8928-d1bd567b958b",
    );
  });
});
