import { describe, expect, it } from "vitest";

import { catalogVerdict, isCatalogued, parsePage, renderCatalog, type Page } from "./catalog.ts";

const ADR = `# 0029 — oxlint et oxfmt à la place d'ESLint et Prettier

- Statut : Accepté — remplace les sections 1 et 2 de [0018](0018-qualite.md)
- Date : 2026-10-09
- Décideurs : Muhammed Cavus

## Contexte et problématique

L'ADR 0018 fait d'ESLint l'outil d'architecture du dépôt. Le cœur de son argument est le lint typé.

Problématique : quel outillage tient le contrat de l'ADR 0018 sur TypeScript 7 ?

## Décision
`;

const SPIKE = `# Spike — better-auth face à l'ADR 0005

- Date : 2026-09-24
- Origine : incertitude déclarée de l'ADR 0005
- Durée : une session

## Question

Avec la version actuelle de better-auth, qu'est-ce qui est fourni tel quel ? Existe-t-il une exigence impossible à tenir ?

## Réponse courte

better-auth tient le cœur de l'ADR 0005.
`;

const page = (relPath: string, text: string) => parsePage({ relPath, text });

describe("parsePage", () => {
  it("takes the title from the first H1", () => {
    expect(page("adr/0029-oxlint.md", ADR).title).toBe(
      "0029 — oxlint et oxfmt à la place d'ESLint et Prettier",
    );
  });

  it("builds a title from the file name when the page has no H1", () => {
    expect(page("adr/0030-un-choix-durable.md", "Du texte sans titre.\n").title).toBe(
      "Un Choix Durable",
    );
  });

  it("places a page in the group of its directory, the root being '.'", () => {
    expect(page("adr/0029-oxlint.md", ADR).group).toBe("adr");
    expect(page("README.md", "# Docs\n").group).toBe(".");
  });

  it("reads the status of an ADR up to its first dash", () => {
    expect(page("adr/0029-oxlint.md", ADR).status).toBe("Accepté");
  });

  it("has no status when the header names none", () => {
    expect(page("spikes/2026-09-24-better-auth.md", SPIKE).status).toBe("");
  });

  it("sums up an ADR by its problem statement", () => {
    expect(page("adr/0029-oxlint.md", ADR).summary).toBe(
      "Quel outillage tient le contrat de l'ADR 0018 sur TypeScript 7 ?",
    );
  });

  it("sums up a spike by its question", () => {
    expect(page("spikes/2026-09-24-better-auth.md", SPIKE).summary).toBe(
      "Avec la version actuelle de better-auth, qu'est-ce qui est fourni tel quel ?",
    );
  });

  it("sums up any other page by its first paragraph of prose", () => {
    const readme =
      "# Docs\n\n## Carte\n\n| a | b |\n\nComment cette documentation est organisée, et où écrire.\n";

    expect(page("README.md", readme).summary).toBe(
      "Comment cette documentation est organisée, et où écrire.",
    );
  });

  it("skips a paragraph that only introduces a list", () => {
    const text =
      "# 0013 — Entitlement\n\n## Contexte\n\nLe produit a besoin d'exprimer un droit de la forme :\n\n- un abonné\n\nCe droit dépend toujours de la chaîne regardée par le spectateur.\n";

    expect(page("adr/0013-entitlement.md", text).summary).toBe(
      "Ce droit dépend toujours de la chaîne regardée par le spectateur.",
    );
  });

  it("stops after the first sentence once it is long enough, even before an accented capital", () => {
    const text =
      "# Guide\n\nLa première phrase est assez longue pour se suffire à elle-même ici. État suivant ignoré.\n";

    expect(page("guide.md", text).summary).toBe(
      "La première phrase est assez longue pour se suffire à elle-même ici.",
    );
  });

  it("flattens links and bold text in the summary", () => {
    const text =
      "# Guide\n\nVoir **le gate** décrit dans [l'ADR 0018](adr/0018.md), il est unique.\n";

    expect(page("guide.md", text).summary).toBe(
      "Voir le gate décrit dans l'ADR 0018, il est unique.",
    );
  });

  it("builds the title from the file name of a page at the root of docs", () => {
    expect(page("0042-sans-titre.md", "Du texte.\n").title).toBe("Sans Titre");
  });

  it("joins a paragraph written over several lines", () => {
    const text =
      "# Guide\n\nUne phrase qui commence sur une ligne\net qui se termine sur la suivante.\n";

    expect(page("guide.md", text).summary).toBe(
      "Une phrase qui commence sur une ligne et qui se termine sur la suivante.",
    );
  });

  it("collapses repeated spaces in the summary", () => {
    expect(page("guide.md", "# Guide\n\nDeux  espaces   ici.\n").summary).toBe("Deux espaces ici.");
  });

  it("does not take an indented list item for prose", () => {
    const text = "# Guide\n\n  - un point de liste en retrait\n\nLe vrai paragraphe.\n";

    expect(page("guide.md", text).summary).toBe("Le vrai paragraphe.");
  });

  it("adds the next sentence while the summary is shorter than 60 characters", () => {
    const text =
      "# Guide\n\nPhrase courte. Une seconde phrase vient la compléter avec assez de mots. Une troisième reste dehors.\n";

    expect(page("guide.md", text).summary).toBe(
      "Phrase courte. Une seconde phrase vient la compléter avec assez de mots.",
    );
  });

  it("does not add a sentence that would push the summary past 180 characters", () => {
    const short = "Phrase courte.";
    const long = `Une seconde phrase ${"très ".repeat(35)}longue.`;
    const text = `# Guide\n\n${short} ${long}\n`;

    expect(page("guide.md", text).summary).toBe(short);
  });

  it("keeps a summary of exactly 180 characters whole", () => {
    const exact = `${"a".repeat(178)}.`.replace(/^a/, "A");
    const text = `# Guide\n\n${exact.padEnd(180, ".")}\n`;

    expect(page("guide.md", text).summary).toBe(exact.padEnd(180, "."));
  });

  it("cuts a first sentence longer than 180 characters on a word, with an ellipsis", () => {
    const words = "abcdefg ".repeat(30).trim();
    const { summary } = page("guide.md", `# Guide\n\n${words}.\n`);

    expect(summary).toBe(`Abcdefg ${"abcdefg ".repeat(21).trim()}…`);
  });

  it("splits sentences on question and exclamation marks too", () => {
    const text =
      "# Guide\n\nUne question assez longue pour suffire à elle seule, vraiment ? Oui ! Fin.\n";

    expect(page("guide.md", text).summary).toBe(
      "Une question assez longue pour suffire à elle seule, vraiment ?",
    );
  });

  it("reads header fields only before the first section", () => {
    const text = "# Guide\n\n## Détails\n\n- Statut : Accepté\n\nUn paragraphe de corps.\n";

    expect(page("guide.md", text).status).toBe("");
  });

  it("reads the whole page as header when it has no section", () => {
    expect(page("guide.md", "# Guide\n\n- Statut : Proposé").status).toBe("Proposé");
  });

  it("reads every header field, not only the first", () => {
    const text = "# Guide\n\n- Date : 2026-10-09\n- Statut : Accepté\n\n## Contexte\n";

    expect(page("guide.md", text).status).toBe("Accepté");
  });

  it("has an empty summary when the page has no prose", () => {
    expect(page("guide.md", "# Guide\n\n- un point\n").summary).toBe("");
  });

  it("builds the title from the file name only, in a nested directory", () => {
    expect(page("adr/sous/0030-un-choix.md", "Du texte.\n").title).toBe("Un Choix");
  });

  it("strips only a leading number from the file name", () => {
    expect(page("notes-2024-bilan.md", "Du texte.\n").title).toBe("Notes 2024 Bilan");
  });

  it("separates paragraphs on a blank line that holds spaces", () => {
    const text = "# Guide\n\nIntroduction de la liste :\n   \nLe vrai paragraphe.\n";

    expect(page("guide.md", text).summary).toBe("Le vrai paragraphe.");
  });

  it("skips a paragraph that runs into a list", () => {
    const text = "# Guide\n\nUn paragraphe collé à sa liste\n  - un point\n\nLe vrai paragraphe.\n";

    expect(page("guide.md", text).summary).toBe("Le vrai paragraphe.");
  });

  it("does not take a numbered list item for prose, but keeps a line that starts with a number", () => {
    const text = "# Guide\n\n12. un point numéroté\n\n1.5 million de spectateurs au pic.\n";

    expect(page("guide.md", text).summary).toBe("1.5 million de spectateurs au pic.");
  });

  it("keeps a line that opens on emphasis as prose", () => {
    expect(page("guide.md", "# Guide\n\n*Important* : ce paragraphe compte.\n").summary).toBe(
      "*Important* : ce paragraphe compte.",
    );
  });

  it("stops once the summary reaches exactly 60 characters", () => {
    const first = `${"A".padEnd(59, "a")}.`;
    const text = `# Guide\n\n${first} Suite exclue.\n`;

    expect(page("guide.md", text).summary).toBe(first);
  });

  it("counts the space between kept sentences toward the 60 characters", () => {
    const one = `${"B".padEnd(28, "b")}.`;
    const two = `${"C".padEnd(29, "c")}.`;
    const text = `# Guide\n\n${one} ${two} Suite exclue.\n`;

    expect(page("guide.md", text).summary).toBe(`${one} ${two}`);
  });

  it("adds a sentence that brings the summary to exactly 180 characters", () => {
    const one = "Phrase courte.";
    const two = `${"D".padEnd(164, "d")}.`;

    expect(page("guide.md", `# Guide\n\n${one} ${two}\n`).summary).toBe(`${one} ${two}`);
  });

  it("counts the joining space toward the 180 characters", () => {
    const one = "Phrase courte.";
    const two = `${"E".padEnd(165, "e")}.`;

    expect(page("guide.md", `# Guide\n\n${one} ${two}\n`).summary).toBe(one);
  });

  it("takes the problem statement only from a line that opens with it", () => {
    const text =
      "# 0030 — X\n\nCe texte cite la Problématique : ailleurs, en passant dans la phrase.\n";

    expect(page("adr/0030-x.md", text).summary).toBe(
      "Ce texte cite la Problématique : ailleurs, en passant dans la phrase.",
    );
  });

  it("derives the doc mode from the directory, unless the page states its own type", () => {
    expect(page("adr/0029-oxlint.md", ADR).type).toBe("explanation");
    expect(page("spikes/2026-09-24-better-auth.md", SPIKE).type).toBe("explanation");
    expect(page("README.md", "# Docs\n").type).toBe("reference");
    expect(page("guide.md", "# Guide\n\n**Type:** how-to\n").type).toBe("how-to");
  });
});

const makePage = (overrides: Partial<Page> = {}): Page => ({
  relPath: "guide.md",
  group: ".",
  title: "Guide",
  type: "reference",
  status: "",
  summary: "",
  ...overrides,
});

const catalogLines = (pages: readonly Page[]) => renderCatalog(pages).split("\n");

describe("renderCatalog", () => {
  it("says it is generated and how to regenerate it", () => {
    expect(renderCatalog([])).toContain(
      "<!-- Généré par packages/docs-catalog. Ne pas modifier à la main : lancer `pnpm generate`. -->",
    );
  });

  it("lists a page with its link, doc mode, status and summary", () => {
    const adr = makePage({
      relPath: "adr/0029-oxlint.md",
      group: "adr",
      title: "0029 — oxlint",
      type: "explanation",
      status: "Accepté",
      summary: "Quel outillage tient le contrat ?",
    });

    expect(catalogLines([adr])).toContain(
      "- [0029 — oxlint](adr/0029-oxlint.md) — _explanation · Accepté_ — Quel outillage tient le contrat ?",
    );
  });

  it("leaves out the status and the summary when a page has none", () => {
    expect(catalogLines([makePage()])).toContain("- [Guide](guide.md) — _reference_");
  });

  it("groups pages under a titled section, root first, then ADRs, then spikes", () => {
    const pages = [
      makePage({ relPath: "spikes/a.md", group: "spikes", title: "Spike" }),
      makePage({ relPath: "adr/0001-a.md", group: "adr", title: "ADR" }),
      makePage({ relPath: "README.md", group: ".", title: "Docs" }),
    ];
    const headings = catalogLines(pages).filter((line) => line.startsWith("## "));

    expect(headings).toEqual([
      "## Charte",
      "## ADR — décisions durables",
      "## Spikes — recherche bornée",
    ]);
  });

  it("puts an unknown directory after the known ones, titled by its path", () => {
    const pages = [
      makePage({ relPath: "runbooks/deploy.md", group: "runbooks" }),
      makePage({ relPath: "adr/0001-a.md", group: "adr" }),
    ];
    const headings = catalogLines(pages).filter((line) => line.startsWith("## "));

    expect(headings).toEqual(["## ADR — décisions durables", "## runbooks"]);
  });

  it("orders the pages of a group by path", () => {
    const pages = [
      makePage({ relPath: "adr/0002-b.md", group: "adr", title: "B" }),
      makePage({ relPath: "adr/0001-a.md", group: "adr", title: "A" }),
    ];
    const rows = catalogLines(pages).filter((line) => line.startsWith("- ["));

    expect(rows).toEqual([
      "- [A](adr/0001-a.md) — _reference_",
      "- [B](adr/0002-b.md) — _reference_",
    ]);
  });

  it("ranks the known groups before the others, even when the alphabet says otherwise", () => {
    const pages = [
      makePage({ relPath: "guides/a.md", group: "guides" }),
      makePage({ relPath: "spikes/a.md", group: "spikes" }),
    ];
    const headings = catalogLines(pages).filter((line) => line.startsWith("## "));

    expect(headings).toEqual(["## Spikes — recherche bornée", "## guides"]);
  });

  it("orders unknown groups alphabetically", () => {
    const pages = [
      makePage({ relPath: "zeta/a.md", group: "zeta" }),
      makePage({ relPath: "beta/a.md", group: "beta" }),
    ];
    const headings = catalogLines(pages).filter((line) => line.startsWith("## "));

    expect(headings).toEqual(["## beta", "## zeta"]);
  });

  it("renders the whole catalog", () => {
    const pages = [
      makePage({ relPath: "README.md", title: "Docs", summary: "Où lire, où écrire." }),
      makePage({
        relPath: "adr/0001-a.md",
        group: "adr",
        title: "0001 — A",
        type: "explanation",
        status: "Accepté",
      }),
      makePage({
        relPath: "spikes/s.md",
        group: "spikes",
        title: "Spike — S",
        type: "explanation",
      }),
    ];

    expect(renderCatalog(pages)).toBe(`# Catalogue de la documentation

<!-- Généré par packages/docs-catalog. Ne pas modifier à la main : lancer \`pnpm generate\`. -->

**Type:** reference

Chaque page de \`docs/\`, une ligne chacune : titre, [mode](README.md#carte), statut et objet. La ligne situe la page ; la page elle-même fait foi.

## Charte

- [Docs](README.md) — _reference_ — Où lire, où écrire.

## ADR — décisions durables

- [0001 — A](adr/0001-a.md) — _explanation · Accepté_

## Spikes — recherche bornée

- [Spike — S](spikes/s.md) — _explanation_
`);
  });

  it("ends with a single newline", () => {
    expect(renderCatalog([makePage()])).toMatch(/[^\n]\n$/);
  });
});

describe("isCatalogued", () => {
  it.each(["README.md", "adr/0001-provider.md", "spikes/2026-09-24-a.md"])(
    "lists %s",
    (relPath) => {
      expect(isCatalogued(relPath)).toBe(true);
    },
  );

  it.each([
    ["the catalog itself", "CATALOG.md"],
    ["an archived page", "archive/old.md"],
    ["a page nested in an archive", "adr/archive/old.md"],
    ["a file that is not Markdown", "adr/schema.png"],
  ])("leaves out %s", (_label, relPath) => {
    expect(isCatalogued(relPath)).toBe(false);
  });
});

describe("catalogVerdict", () => {
  it("passes when the committed catalog matches the docs", () => {
    expect(catalogVerdict({ committed: "x", expected: "x", pageCount: 35 })).toEqual({
      ok: true,
      message: "docs/CATALOG.md est à jour (35 pages).",
    });
  });

  it("fails and gives the command when the catalog is stale", () => {
    expect(catalogVerdict({ committed: "old", expected: "new", pageCount: 35 })).toEqual({
      ok: false,
      message:
        "docs/CATALOG.md n'est plus à jour. Lancez `pnpm generate` et committez le résultat.",
    });
  });

  it("fails and gives the command when the catalog is missing", () => {
    expect(catalogVerdict({ committed: undefined, expected: "new", pageCount: 35 })).toEqual({
      ok: false,
      message: "docs/CATALOG.md est absent. Lancez `pnpm generate` et committez le résultat.",
    });
  });
});
