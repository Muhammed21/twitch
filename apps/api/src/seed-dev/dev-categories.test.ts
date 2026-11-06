import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  parseCategoryName,
  parseCategorySlug,
  parseCategoryTags,
} from "../modules/channel/domain/category.ts";
import { coverFrame, renderCover } from "./category-covers.ts";
import { DEV_CATEGORIES } from "./dev-categories.ts";

const CAPTURE_WIDTH = 1179;
const CAPTURE_HEIGHT = 2676;

describe("catégories du seed de développement", () => {
  it("couvre une trentaine de catégories, jeux et IRL, sans doublon de slug", () => {
    const slugs = DEV_CATEGORIES.map(({ slug }) => slug);

    expect(DEV_CATEGORIES.length).toBeGreaterThanOrEqual(30);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("tague chaque catégorie, comme Parcourir l'affiche sous la pochette", () => {
    expect(DEV_CATEGORIES.filter(({ tags }) => tags.length === 0)).toEqual([]);
  });

  it("ne donne que des slugs, noms et tags que le catalogue accepte", () => {
    expect(
      DEV_CATEGORIES.filter(
        ({ slug, name, tags }) =>
          !parseCategorySlug(slug).ok || !parseCategoryName(name).ok || !parseCategoryTags(tags).ok,
      ),
    ).toEqual([]);
  });

  it("reprend les douze pochettes entières des captures de Parcourir, une seule fois chacune", () => {
    const frames = DEV_CATEGORIES.flatMap(({ cover }) =>
      cover.kind === "capture" ? [{ capture: cover.capture, ...coverFrame(cover) }] : [],
    );
    const keys = frames.map(({ capture, left, top }) => `${capture}:${left}:${top}`);

    expect(frames).toHaveLength(12);
    expect(new Set(keys).size).toBe(12);
    expect(
      frames.filter(
        ({ left, top, width, height }) =>
          left + width > CAPTURE_WIDTH || top + height > CAPTURE_HEIGHT,
      ),
    ).toEqual([]);
  });

  it("donne aux autres catégories une pochette générée, chacune de sa teinte", () => {
    const hues = DEV_CATEGORIES.flatMap(({ cover }) =>
      cover.kind === "generated" ? [cover.hue] : [],
    );

    expect(hues).toHaveLength(DEV_CATEGORIES.length - 12);
    expect(hues.every((hue) => Number.isInteger(hue) && hue >= 0 && hue < 360)).toBe(true);
  });

  it("découpe chaque pochette relevée dans une capture du dépôt", async () => {
    const sizes = await Promise.all(
      DEV_CATEGORIES.flatMap(({ cover }) => (cover.kind === "capture" ? [cover] : [])).map(
        async (cover) => {
          const { width, height } = await sharp(await renderCover(cover)).metadata();
          return { width, height };
        },
      ),
    );

    expect(
      new Set(DEV_CATEGORIES.map(({ cover }) => cover.kind === "capture" && cover.capture)),
    ).toEqual(new Set([false, "liste-categories--defaut.png", "liste-categories--defile.png"]));
    expect(sizes).toEqual(Array.from({ length: 12 }, () => ({ width: 345, height: 460 })));
  });

  it("nomme et tague les catégories des captures comme la capture", () => {
    const byName = new Map(DEV_CATEGORIES.map(({ name, tags }) => [name, tags]));

    expect(byName.get("Grand Theft Auto V")).toEqual(["FPS", "Shooter"]);
    expect(byName.get("VALORANT")).toEqual(["FPS", "Shooter"]);
    expect(byName.get("League of Legends")).toEqual(["RPG", "Strategy"]);
    expect(byName.get("ROBLOX")).toEqual(["Platformer"]);
  });
});
