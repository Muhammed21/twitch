import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { IMAGE_PURPOSES } from "../platform/images/image-purposes.ts";
import {
  CAPTURES_DIRECTORY,
  type CategoryCover,
  coverFrame,
  generatedCoverSvg,
  renderCover,
} from "./category-covers.ts";

const CAPTURED: CategoryCover = {
  kind: "capture",
  capture: "liste-categories--defile.png",
  column: 2,
  top: 1520,
};

describe("cadre d'une pochette relevée sur les captures de Parcourir", () => {
  it("place la pochette dans sa colonne, au format portrait 3:4 de la grille", () => {
    expect(coverFrame({ column: 0, top: 511 })).toEqual({
      left: 48,
      top: 511,
      width: 345,
      height: 460,
    });
    expect(coverFrame({ column: 1, top: 757 })).toMatchObject({ left: 417, top: 757 });
    expect(coverFrame({ column: 2, top: 1520 })).toMatchObject({ left: 786, top: 1520 });
  });
});

describe("pochette originale générée", () => {
  it("dessine un portrait au format de sortie des catégories, avec l'initiale de chaque mot", () => {
    const svg = generatedCoverSvg({ name: "Software and Game Development", hue: 210 });

    expect(svg).toContain(`width="${IMAGE_PURPOSES.category.outputWidth}"`);
    expect(svg).toContain(`height="${IMAGE_PURPOSES.category.outputHeight}"`);
    expect(svg).toContain(">SG<");
    expect(svg).toContain("hsl(210 ");
  });

  it("passe les signes et les mots de liaison", () => {
    expect(generatedCoverSvg({ name: "Food & Drink", hue: 20 })).toContain(">FD<");
    expect(generatedCoverSvg({ name: "World of Warcraft", hue: 20 })).toContain(">WW<");
    expect(generatedCoverSvg({ name: "Art and the Game", hue: 20 })).toContain(">AG<");
  });

  it("met l'initiale en capitale, et garde le chiffre d'un nom", () => {
    expect(generatedCoverSvg({ name: "chess", hue: 20 })).toContain(">C<");
    expect(generatedCoverSvg({ name: "Dota 2", hue: 20 })).toContain(">D2<");
  });
});

describe("rendu d'une pochette en PNG", () => {
  it("découpe la pochette dans la capture, au pixel près", async () => {
    const png = await renderCover(CAPTURED);

    expect(await sharp(png).metadata()).toMatchObject({ format: "png", width: 345, height: 460 });
  });

  it("rend la pochette générée au format de sortie des catégories", async () => {
    const png = await renderCover({ kind: "generated", hue: 280, name: "Art" });

    expect(await sharp(png).metadata()).toMatchObject({
      format: "png",
      width: IMAGE_PURPOSES.category.outputWidth,
      height: IMAGE_PURPOSES.category.outputHeight,
    });
  });

  it("lit les captures dans docs/reference-ui/parcourir du dépôt", () => {
    expect(CAPTURES_DIRECTORY.pathname).toMatch(/\/docs\/reference-ui\/parcourir\/$/);
  });
});
