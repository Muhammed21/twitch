import { describe, expect, it } from "vitest";

import {
  type LiveListItem,
  type LivePosition,
  listLives,
  withLiveThumbnails,
  withLiveViewerCounts,
} from "./list-lives.ts";

const at = (minute: number): Date => new Date(Date.UTC(2026, 10, 2, 20, minute));

const makeLive = (index: number): LiveListItem => ({
  channelId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  slug: `chaine_${index}`,
  title: `Live ${index}`,
  startedAt: at(60 - index),
  categoryId: null,
});

const LIVES = [1, 2, 3, 4, 5].map(makeLive);

const positionOf = ({ startedAt, channelId }: LiveListItem): LivePosition => ({
  startedAt,
  channelId,
});

const inMemoryReader = (lives: readonly LiveListItem[]) => {
  const requests: {
    after: LivePosition | undefined;
    take: number;
    categoryIds?: readonly string[];
  }[] = [];
  return {
    requests,
    reader: {
      page: async (request: {
        after: LivePosition | undefined;
        take: number;
        categoryIds?: readonly string[];
      }) => {
        requests.push(request);
        const start =
          request.after === undefined
            ? 0
            : lives.findIndex((live) => live.channelId === request.after?.channelId) + 1;
        return lives.slice(start, start + request.take);
      },
    },
  };
};

describe("liste des lives de discovery", () => {
  it("rend une page et la position de son dernier live quand d'autres suivent", async () => {
    const { reader } = inMemoryReader(LIVES);

    expect(await listLives(reader)({ after: undefined, limit: 2 })).toEqual({
      items: [LIVES[0], LIVES[1]],
      next: positionOf(makeLive(2)),
    });
  });

  it("prend la position du dernier live d'une page de plus de deux lives", async () => {
    const { reader } = inMemoryReader(LIVES);

    expect((await listLives(reader)({ after: undefined, limit: 3 })).next).toEqual(
      positionOf(makeLive(3)),
    );
  });

  it("ne rend aucune position suivante quand la page contient exactement les derniers lives", async () => {
    const { reader } = inMemoryReader(LIVES);

    expect(await listLives(reader)({ after: positionOf(makeLive(3)), limit: 2 })).toEqual({
      items: [LIVES[3], LIVES[4]],
      next: undefined,
    });
  });

  it("ne rend aucune position suivante sur une page incomplète", async () => {
    const { reader } = inMemoryReader(LIVES);

    expect(await listLives(reader)({ after: positionOf(makeLive(4)), limit: 3 })).toEqual({
      items: [LIVES[4]],
      next: undefined,
    });
  });

  it("demande un live de plus que la page pour savoir s'il en reste", async () => {
    const { reader, requests } = inMemoryReader(LIVES);
    const after = positionOf(makeLive(1));

    await listLives(reader)({ after, limit: 2 });

    expect(requests).toEqual([{ after, take: 3 }]);
  });

  it("transmet au lecteur les catégories dont les lives sont demandés", async () => {
    const { reader, requests } = inMemoryReader(LIVES);
    const categoryIds = ["0b5e4d3c-2a19-4f08-8e7d-6c5b4a392817"];

    await listLives(reader)({ after: undefined, limit: 2, categoryIds });

    expect(requests).toEqual([{ after: undefined, take: 3, categoryIds }]);
  });

  it("rend une page vide quand aucun live ne suit", async () => {
    const { reader } = inMemoryReader([]);

    expect(await listLives(reader)({ after: undefined, limit: 20 })).toEqual({
      items: [],
      next: undefined,
    });
  });
});

const makeViewerCounts = (counts: ReadonlyMap<string, number>) => {
  const reads: (readonly string[])[] = [];
  return {
    reads,
    read: async (channelIds: readonly string[]) => {
      reads.push(channelIds);
      return new Map([...counts].filter(([channelId]) => channelIds.includes(channelId)));
    },
  };
};

const FIRST_PAGE = { after: undefined, limit: 3 };

describe("liste des lives avec le nombre de viewers", () => {
  it("ajoute à chaque live de la page son nombre de viewers, zéro quand personne ne regarde", async () => {
    const { reader } = inMemoryReader(LIVES);
    const viewerCounts = makeViewerCounts(
      new Map([
        [makeLive(1).channelId, 12],
        [makeLive(3).channelId, 4],
      ]),
    );
    const lives = withLiveViewerCounts({
      lives: listLives(reader),
      viewerCounts: viewerCounts.read,
      onViewerCountFailure: () => {},
    });

    expect(await lives(FIRST_PAGE)).toEqual({
      items: [
        { ...makeLive(1), viewerCount: 12 },
        { ...makeLive(2), viewerCount: 0 },
        { ...makeLive(3), viewerCount: 4 },
      ],
      next: positionOf(makeLive(3)),
    });
  });

  it("lit les compteurs des seuls lives de la page, en une lecture", async () => {
    const { reader } = inMemoryReader(LIVES);
    const viewerCounts = makeViewerCounts(new Map());
    const lives = withLiveViewerCounts({
      lives: listLives(reader),
      viewerCounts: viewerCounts.read,
      onViewerCountFailure: () => {},
    });

    await lives(FIRST_PAGE);

    expect(viewerCounts.reads).toEqual([[1, 2, 3].map((index) => makeLive(index).channelId)]);
  });

  it("rend la page sans nombre de viewers, et signale l'échec, quand les compteurs sont illisibles", async () => {
    const { reader } = inMemoryReader(LIVES);
    const failure = new Error("redis injoignable");
    const failures: unknown[] = [];
    const lives = withLiveViewerCounts({
      lives: listLives(reader),
      viewerCounts: async () => {
        throw failure;
      },
      onViewerCountFailure: (error) => failures.push(error),
    });

    expect(await lives(FIRST_PAGE)).toEqual({
      items: [makeLive(1), makeLive(2), makeLive(3)],
      next: positionOf(makeLive(3)),
    });
    expect(failures).toEqual([failure]);
  });

  it("ne lit aucun compteur pour une page vide", async () => {
    const { reader } = inMemoryReader([]);
    const viewerCounts = makeViewerCounts(new Map());
    const lives = withLiveViewerCounts({
      lives: listLives(reader),
      viewerCounts: viewerCounts.read,
      onViewerCountFailure: () => {},
    });

    expect(await lives(FIRST_PAGE)).toEqual({ items: [], next: undefined });
    expect(viewerCounts.reads).toEqual([]);
  });
});

const thumbnailUrlOf = (index: number) =>
  `http://127.0.0.1:3002/hls/channels/${String(index).padStart(2, "0")}/thumbnail.jpg`;

const makeThumbnailUrls = (urls: ReadonlyMap<string, string>) => {
  const reads: (readonly string[])[] = [];
  return {
    reads,
    read: async (channelIds: readonly string[]) => {
      reads.push(channelIds);
      return new Map([...urls].filter(([channelId]) => channelIds.includes(channelId)));
    },
  };
};

describe("liste des lives avec leur vignette", () => {
  it("ajoute à chaque live de la page l'URL de sa vignette, quand sa chaîne a un canal vidéo", async () => {
    const { reader } = inMemoryReader(LIVES);
    const thumbnailUrls = makeThumbnailUrls(
      new Map([
        [makeLive(1).channelId, thumbnailUrlOf(1)],
        [makeLive(3).channelId, thumbnailUrlOf(3)],
      ]),
    );
    const lives = withLiveThumbnails({
      lives: listLives(reader),
      thumbnailUrls: thumbnailUrls.read,
      onThumbnailFailure: () => {},
    });

    expect(await lives(FIRST_PAGE)).toStrictEqual({
      items: [
        { ...makeLive(1), thumbnailUrl: thumbnailUrlOf(1) },
        makeLive(2),
        { ...makeLive(3), thumbnailUrl: thumbnailUrlOf(3) },
      ],
      next: positionOf(makeLive(3)),
    });
    expect(thumbnailUrls.reads).toEqual([[1, 2, 3].map((index) => makeLive(index).channelId)]);
  });

  it("rend la page sans vignette, et signale l'échec, quand les canaux vidéo sont illisibles", async () => {
    const { reader } = inMemoryReader(LIVES);
    const failure = new Error("base injoignable");
    const failures: unknown[] = [];
    const lives = withLiveThumbnails({
      lives: listLives(reader),
      thumbnailUrls: async () => {
        throw failure;
      },
      onThumbnailFailure: (error) => failures.push(error),
    });

    expect(await lives(FIRST_PAGE)).toEqual({
      items: [makeLive(1), makeLive(2), makeLive(3)],
      next: positionOf(makeLive(3)),
    });
    expect(failures).toEqual([failure]);
  });

  it("ne lit aucune vignette pour une page vide", async () => {
    const { reader } = inMemoryReader([]);
    const thumbnailUrls = makeThumbnailUrls(new Map());
    const lives = withLiveThumbnails({
      lives: listLives(reader),
      thumbnailUrls: thumbnailUrls.read,
      onThumbnailFailure: () => {},
    });

    expect(await lives(FIRST_PAGE)).toEqual({ items: [], next: undefined });
    expect(thumbnailUrls.reads).toEqual([]);
  });
});
