import { describe, expect, it } from "vitest";

import { createApp } from "./create-app.ts";

describe("createApp", () => {
  it("refuse de démarrer avec une configuration invalide, en nommant la variable", async () => {
    await expect(createApp({ env: { API_PORT: "3000" } })).rejects.toThrow("DATABASE_URL_HEALTH");
  });
});
