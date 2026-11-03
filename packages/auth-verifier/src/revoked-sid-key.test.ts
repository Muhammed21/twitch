import { describe, expect, it } from "vitest";

import { revokedSidKey } from "./index.ts";

describe("revokedSidKey", () => {
  it("nomme la clé Redis d'une session révoquée, écrite par l'API et lue par le chat", () => {
    expect(revokedSidKey("sid-1")).toBe("identity:revoked-sid:sid-1");
  });
});
