import { describe, expect, it } from "vitest";

import { limitConcurrency } from "./concurrency-limit.ts";

const deferred = () => {
  const settle: { resolve: (value: string) => void } = { resolve: () => {} };
  const promise = new Promise<string>((resolve) => {
    settle.resolve = resolve;
  });
  return { promise, resolve: (value: string) => settle.resolve(value) };
};

const settled = () =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

describe("plafond de tâches simultanées", () => {
  it("lance au plus le plafond de tâches, puis la suivante quand une se termine", async () => {
    const tasks = [deferred(), deferred(), deferred()];
    const started: number[] = [];
    const limited = limitConcurrency(2);

    const results = tasks.map((task, index) =>
      limited(() => {
        started.push(index);
        return task.promise;
      }),
    );
    await settled();
    expect(started).toEqual([0, 1]);

    tasks[1]?.resolve("deux");
    await settled();
    expect(started).toEqual([0, 1, 2]);

    tasks[0]?.resolve("un");
    tasks[2]?.resolve("trois");
    expect(await Promise.all(results)).toEqual(["un", "deux", "trois"]);
  });

  it("libère sa place quand une tâche échoue", async () => {
    const limited = limitConcurrency(1);

    await expect(limited(async () => Promise.reject(new Error("décodage")))).rejects.toThrow(
      "décodage",
    );
    expect(await limited(async () => "suivante")).toBe("suivante");
  });
});
