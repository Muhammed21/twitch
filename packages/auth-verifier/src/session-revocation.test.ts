import { describe, expect, it } from "vitest";

import { SESSION_REVOKED_CHANNEL, sessionRevocationOf } from "./index.ts";

describe("annonce de révocation de session", () => {
  it("se publie sur le canal Pub/Sub écouté par le chat", () => {
    expect(SESSION_REVOKED_CHANNEL).toBe("identity.session.revoked");
  });

  it("se lit depuis le message publié par l'API", () => {
    const published = JSON.stringify({ userId: "user-1", sids: ["sid-1", "sid-2"] });

    expect(sessionRevocationOf(published)).toEqual({
      ok: true,
      value: { userId: "user-1", sids: ["sid-1", "sid-2"] },
    });
  });

  it.each([
    ["un message qui n'est pas du JSON", "{"],
    ["une annonce sans sids", JSON.stringify({ userId: "user-1" })],
    ["une annonce sans utilisateur", JSON.stringify({ sids: ["sid-1"] })],
    [
      "une annonce aux sids qui ne sont pas des chaînes",
      JSON.stringify({ userId: "u", sids: [1] }),
    ],
  ])("refuse %s", (_name, message) => {
    expect(sessionRevocationOf(message)).toEqual({ ok: false, error: "malformed" });
  });
});
