import { describe, expect, it } from "vitest";

import type { IngestPublication } from "../ingest/publish-gate.ts";
import type { RtmpMessage } from "../rtmp/chunk-stream.ts";
import { createLivePipeline } from "./live-pipeline.ts";

const makeMessage = (typeId: number): RtmpMessage => ({
  chunkStreamId: 4,
  typeId,
  streamId: 1,
  timestamp: 0,
  payload: new Uint8Array(1),
});

const makeWorld = ({
  maxSessions = 2,
  gate,
}: {
  maxSessions?: number;
  gate?: (streamKey: string) => Promise<IngestPublication | undefined>;
} = {}) => {
  const journal: string[] = [];
  const exits = new Map<string, () => void>();
  const granting = async (streamKey: string): Promise<IngestPublication> => {
    journal.push(`session ${streamKey}`);
    return {
      sessionId: `s-${streamKey}`,
      end: async () => {
        journal.push(`session terminée ${streamKey}`);
      },
    };
  };
  const pipeline = createLivePipeline({
    gate: gate ?? granting,
    maxSessions,
    startPackaging: ({ sessionId, onExit }) => {
      journal.push(`ffmpeg ${sessionId}`);
      exits.set(sessionId, onExit);
      return {
        write: (message) => journal.push(`tag ${message.typeId} ${sessionId}`),
        stop: async () => {
          journal.push(`ffmpeg tué ${sessionId}`);
        },
      };
    },
  });
  const closes: string[] = [];
  const publish = (streamKey: string) =>
    pipeline(streamKey, { close: () => closes.push(streamKey) });
  return { journal, exits, closes, publish };
};

describe("publication vers un ffmpeg par session (ADR 0031, §4)", () => {
  it("lance un ffmpeg pour la session accordée, lui écrit les messages, puis le tue avant de clore la session", async () => {
    const { journal, publish } = makeWorld();

    const publication = await publish("a");
    publication?.receive?.(makeMessage(9));
    await publication?.end();

    expect(journal).toEqual([
      "session a",
      "ffmpeg s-a",
      "tag 9 s-a",
      "ffmpeg tué s-a",
      "session terminée a",
    ]);
  });

  it("ne lance aucun ffmpeg pour une clé refusée", async () => {
    const { journal, publish } = makeWorld({ gate: async () => undefined });

    expect(await publish("a")).toBeUndefined();
    expect(journal).toEqual([]);
  });

  it("refuse une publication au-delà du plafond de sessions, sans vérifier sa clé", async () => {
    const { journal, publish } = makeWorld({ maxSessions: 2 });
    await publish("a");
    await publish("b");

    expect(await publish("c")).toBeUndefined();
    expect(journal.filter((line) => line.startsWith("session "))).toEqual([
      "session a",
      "session b",
    ]);
  });

  it("compte une publication en cours de vérification, pour que deux publish simultanés ne dépassent pas le plafond", async () => {
    const { publish } = makeWorld({ maxSessions: 1 });

    const [first, second] = await Promise.all([publish("a"), publish("b")]);

    expect([first, second].filter((publication) => publication !== undefined)).toHaveLength(1);
  });

  it("rend sa place à une publication refusée, en échec ou terminée", async () => {
    const answers = ["refusée", "en échec", "accordée", "accordée"];
    const { publish } = makeWorld({
      maxSessions: 1,
      gate: async (streamKey) => {
        const answer = answers.shift();
        if (answer === "en échec") {
          throw new Error("base injoignable");
        }
        return answer === "refusée"
          ? undefined
          : { sessionId: `s-${streamKey}`, end: async () => undefined };
      },
    });

    expect(await publish("a")).toBeUndefined();
    await expect(publish("b")).rejects.toThrow("base injoignable");
    await (await publish("c"))?.end();

    expect(await publish("d")).toBeDefined();
  });

  it("ferme la connexion de la session dont le ffmpeg meurt", async () => {
    const { exits, closes, publish } = makeWorld();
    await publish("a");
    await publish("b");

    exits.get("s-a")?.();

    expect(closes).toEqual(["a"]);
  });
});
