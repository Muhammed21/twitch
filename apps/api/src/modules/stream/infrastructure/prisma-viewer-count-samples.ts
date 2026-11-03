import type { KeysetPage } from "@repo/db";

import type {
  OpenSessionPages,
  OpenSessionToSample,
  ViewerCountSamples,
} from "../application/sample-viewer-counts.ts";
import type { StreamPrisma } from "./prisma-stream-sessions.ts";

const OPEN_SESSIONS_PAGE_SIZE = 100;

const openSessionsPage = async (
  prisma: StreamPrisma,
  { take, after }: KeysetPage,
): Promise<readonly OpenSessionToSample[]> =>
  (
    await prisma.streamSession.findMany({
      where: { endedAt: null, id: { gt: after } },
      orderBy: { id: "asc" },
      take,
      select: { id: true, channelId: true },
    })
  ).map(({ id, channelId }) => ({ sessionId: id, channelId }));

const visitPages = async ({
  prisma,
  pageSize,
  after,
  visit,
}: {
  prisma: StreamPrisma;
  pageSize: number;
  after: string | undefined;
  visit: (page: readonly OpenSessionToSample[]) => Promise<void>;
}): Promise<void> => {
  const page = await openSessionsPage(prisma, { take: pageSize, after });
  await visit(page);
  const last = page.length === pageSize ? page.at(-1) : undefined;
  if (last !== undefined) {
    await visitPages({ prisma, pageSize, after: last.sessionId, visit });
  }
};

export const prismaOpenSessionPages = ({
  prisma,
  pageSize = OPEN_SESSIONS_PAGE_SIZE,
}: {
  prisma: StreamPrisma;
  pageSize?: number;
}): OpenSessionPages => ({
  forEachPage: (visit) => visitPages({ prisma, pageSize, after: undefined, visit }),
});

export const prismaViewerCountSamples = (prisma: StreamPrisma): ViewerCountSamples => ({
  record: async (samples) => {
    await prisma.streamViewerCountSample.createMany({ data: [...samples], skipDuplicates: true });
  },
});
