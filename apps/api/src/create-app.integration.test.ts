import { describe, expect, it } from "vitest";

import { createApp } from "./create-app.ts";

const readiness = async (env: Record<string, string | undefined>) => {
  const { app } = await createApp({ env, logSink: () => {} });
  await app.listen(0, "127.0.0.1");
  try {
    return (await fetch(`${await app.getUrl()}/health/ready`)).status;
  } finally {
    await app.close();
  }
};

describe("API assemblée, contre la base locale migrée", () => {
  it("est prête quand la base porte la dernière migration du code", async () => {
    expect(await readiness(process.env)).toBe(200);
  });

  it("n'est pas prête quand la base est injoignable", async () => {
    expect(
      await readiness({
        ...process.env,
        DATABASE_URL_HEALTH: "postgresql://app_health:secret@127.0.0.1:1/app",
      }),
    ).toBe(503);
  });
});
