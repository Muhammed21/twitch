import { describe, expect, it, vi } from "vitest";

import { errorDetails, stdoutSink, writeLog } from "./logging.ts";

describe("errorDetails", () => {
  it("garde le message et la pile d'une Error", () => {
    const error = new Error("base injoignable");

    expect(errorDetails(error)).toEqual({ error: "base injoignable", stack: error.stack });
  });

  it("convertit en texte ce qui n'est pas une Error, sans pile", () => {
    expect(errorDetails("timeout")).toEqual({ error: "timeout" });
  });
});

describe("writeLog", () => {
  it("écrit une ligne JSON horodatée", () => {
    const lines: string[] = [];

    writeLog((line) => lines.push(line), { level: "info", msg: "démarrage", port: 3000 });

    expect(lines.map((line): unknown => JSON.parse(line))).toEqual([
      { time: expect.any(String), level: "info", msg: "démarrage", port: 3000 },
    ]);
  });
});

describe("stdoutSink", () => {
  it("écrit la ligne sur la sortie standard, terminée par un saut de ligne", () => {
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    stdoutSink('{"msg":"x"}');

    expect(write).toHaveBeenCalledWith('{"msg":"x"}\n');
    write.mockRestore();
  });
});
