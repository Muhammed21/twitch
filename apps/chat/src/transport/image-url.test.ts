import { describe, expect, it } from "vitest";

import { imageUrlOf } from "./image-url.ts";

describe("URL publique d'une image", () => {
  it("suit la base publique des images de la clé servie", () => {
    expect(imageUrlOf("https://images.twitch.example")("images/avatar/a.webp")).toBe(
      "https://images.twitch.example/images/avatar/a.webp",
    );
  });

  it("ne double pas la barre d'une base qui finit par une barre", () => {
    expect(imageUrlOf("http://127.0.0.1:8333/twitch-local/")("images/avatar/a.webp")).toBe(
      "http://127.0.0.1:8333/twitch-local/images/avatar/a.webp",
    );
  });
});
