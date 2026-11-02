import { describe, expect, it } from "vitest";

import { type LiveListItem, type LivePosition, listLives } from "./list-lives.ts";

const at = (minute: number): Date => new Date(Date.UTC(2026, 10, 2, 20, minute));

const makeLive = (index: number): LiveListItem => ({
  channelId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  slug: `chaine_${index}`,
  title: `Live ${index}`,
  startedAt: at(60 - index),
});

const LIVES = [1, 2, 3, 4, 5].map(makeLive);

const positionOf = ({ startedAt, channelId }: LiveListItem): LivePosition => ({
  startedAt,
  channelId,
});

const inMemoryReader = (lives: readonly LiveListItem[]) => {
  const requests: { after: LivePosition | undefined; take: number }[] = [];
  return {
    requests,
    reader: {
      page: async (request: { after: LivePosition | undefined; take: number }) => {
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

  it("rend une page vide quand aucun live ne suit", async () => {
    const { reader } = inMemoryReader([]);

    expect(await listLives(reader)({ after: undefined, limit: 20 })).toEqual({
      items: [],
      next: undefined,
    });
  });
});
