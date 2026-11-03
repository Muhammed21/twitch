import { setImmediate } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import { withSettledCommands } from "./settled-commands.ts";

const makeClient = () => ({
  name: "fan-out",
  publish: async (channel: string) => {
    throw new Error(`publication refusée sur ${channel}`);
  },
  subscribe: async (channel: string) => channel.length,
  on: (event: string) => event,
});

describe("commandes Redis du fan-out sans rejet non géré", () => {
  it("signale l'échec d'une commande que l'appelant n'attend pas", async () => {
    const failures: unknown[] = [];
    const client = withSettledCommands(makeClient(), (error) => {
      failures.push(error);
    });

    void client.publish("chat#/#");
    await setImmediate();

    expect(failures).toEqual([new Error("publication refusée sur chat#/#")]);
  });

  it("rend le résultat d'une commande réussie, et le rejet à qui l'attend", async () => {
    const client = withSettledCommands(makeClient(), () => undefined);

    expect(await client.subscribe("chat")).toBe(4);
    await expect(client.publish("chat")).rejects.toThrow("publication refusée sur chat");
  });

  it("laisse passer les méthodes synchrones et les propriétés", () => {
    const client = withSettledCommands(makeClient(), () => undefined);

    expect(client.on("error")).toBe("error");
    expect(client.name).toBe("fan-out");
  });
});
