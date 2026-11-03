import type { IngestPublication } from "../ingest/publish-gate.ts";
import type { Publication, PublicationControls } from "../rtmp/rtmp-server.ts";
import type { Packaging } from "./packager.ts";

export const createLivePipeline = ({
  gate,
  maxSessions,
  startPackaging,
}: {
  gate: (streamKey: string) => Promise<IngestPublication | undefined>;
  maxSessions: number;
  startPackaging: (session: {
    sessionId: string;
    onExit: () => void;
  }) => Pick<Packaging, "write" | "stop">;
}) => {
  const sessions = { active: 0 };
  const release = () => {
    sessions.active -= 1;
  };

  return async (
    streamKey: string,
    { close }: PublicationControls,
  ): Promise<Publication | undefined> => {
    if (sessions.active >= maxSessions) {
      return undefined;
    }
    sessions.active += 1;
    const granted = await gate(streamKey).catch((error: unknown) => {
      release();
      throw error;
    });
    if (granted === undefined) {
      release();
      return undefined;
    }
    const packaging = startPackaging({ sessionId: granted.sessionId, onExit: close });
    return {
      receive: packaging.write,
      end: async () => {
        await packaging.stop();
        release();
        await granted.end();
      },
    };
  };
};
