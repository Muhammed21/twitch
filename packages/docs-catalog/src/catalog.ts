export type Page = {
  readonly relPath: string;
  readonly group: string;
  readonly title: string;
  readonly type: string;
  readonly status: string;
  readonly summary: string;
};

const SUMMARY_MAX = 180;
const SUMMARY_MIN = 60;

const TYPE_BY_GROUP: Readonly<Record<string, string>> = {
  adr: "explanation",
  spikes: "explanation",
};

const groupOf = (relPath: string): string => {
  const slash = relPath.lastIndexOf("/");
  return slash === -1 ? "." : relPath.slice(0, slash);
};

const titleFromFilename = (relPath: string): string =>
  (relPath.split("/").at(-1) ?? relPath)
    .replace(/\.md$/, "")
    .replace(/^\d+[-_]/, "")
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const flattenInline = (text: string): string =>
  text
    .replaceAll(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replaceAll(/\*\*([^*]+)\*\*/g, "$1")
    .replaceAll(/\s+/g, " ")
    .trim();

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

const clamp = (text: string, max: number): string => {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
};

const firstSentences = (text: string): string => {
  const sentences = flattenInline(text).split(/(?<=[.!?])\s+(?=[\p{Lu}"«`*([])/u);
  const kept = sentences.reduce<readonly string[]>((acc, sentence) => {
    const joined = [...acc, sentence].join(" ");
    const full =
      acc.length > 0 && (acc.join(" ").length >= SUMMARY_MIN || joined.length > SUMMARY_MAX);
    return full ? acc : [...acc, sentence];
  }, []);
  return clamp(kept.join(" "), SUMMARY_MAX);
};

const HEADER_FIELD = /^(?:- ([^:]+?) :|\*\*([^*:]+):\*\*) *(.*)$/;

const headerFields = (header: readonly string[]): ReadonlyMap<string, string> =>
  new Map(
    header.flatMap((line) => {
      const match = HEADER_FIELD.exec(line);
      return match === null ? [] : [[match[1] ?? match[2] ?? "", match[3] ?? ""] as const];
    }),
  );

const STRUCTURAL = /^(#|\||>|-|\+|\*\s|<|\d+\.\s|```)/;

const isProse = (line: string): boolean => !STRUCTURAL.test(line);

const firstParagraph = (text: string): string =>
  text
    .split(/\n\s*\n/)
    .map((block) => block.split("\n").map((line) => line.trim()))
    .filter((block) => block.every(isProse))
    .map((block) => block.join(" "))
    .find((paragraph) => !paragraph.endsWith(":")) ?? "";

const PROBLEM = /^Problématique :(.*)$/m;

const summarySource = (text: string): string => PROBLEM.exec(text)?.[1] ?? firstParagraph(text);

export const parsePage = ({
  relPath,
  text,
}: {
  readonly relPath: string;
  readonly text: string;
}): Page => {
  const lines = text.split("\n");
  const h1 = lines.find((line) => line.startsWith("# "));
  const firstSection = lines.findIndex((line) => line.startsWith("## "));
  const fields = headerFields(firstSection === -1 ? lines : lines.slice(0, firstSection));
  const group = groupOf(relPath);

  return {
    relPath,
    group,
    title: flattenInline(h1 === undefined ? titleFromFilename(relPath) : h1.slice(2)),
    type: fields.get("Type")?.toLowerCase() ?? TYPE_BY_GROUP[group] ?? "reference",
    status: flattenInline(fields.get("Statut") ?? "").split(" — ")[0] ?? "",
    summary: capitalize(firstSentences(summarySource(text))),
  };
};

const GROUP_TITLES: ReadonlyMap<string, string> = new Map([
  [".", "Charte"],
  ["adr", "ADR — décisions durables"],
  ["spikes", "Spikes — recherche bornée"],
]);

const groupRank = (group: string): number => {
  const rank = [...GROUP_TITLES.keys()].indexOf(group);
  return rank === -1 ? GROUP_TITLES.size : rank;
};

const renderPage = (page: Page): string => {
  const mode = [page.type, page.status].filter(Boolean).join(" · ");
  const summary = page.summary === "" ? "" : ` — ${page.summary}`;
  return `- [${page.title}](${page.relPath}) — _${mode}_${summary}`;
};

export const renderCatalog = (pages: readonly Page[]): string => {
  const groups = [...new Set(pages.map((page) => page.group))].toSorted(
    (a, b) => groupRank(a) - groupRank(b) || a.localeCompare(b),
  );
  const sections = groups.map((group) => {
    const rows = pages
      .filter((page) => page.group === group)
      .toSorted((a, b) => a.relPath.localeCompare(b.relPath))
      .map(renderPage);
    return [`## ${GROUP_TITLES.get(group) ?? group}`, "", ...rows].join("\n");
  });

  return [
    "# Catalogue de la documentation",
    "",
    "<!-- Généré par packages/docs-catalog. Ne pas modifier à la main : lancer `pnpm generate`. -->",
    "",
    "**Type:** reference",
    "",
    "Chaque page de `docs/`, une ligne chacune : titre, [mode](README.md#carte), statut et objet. La ligne situe la page ; la page elle-même fait foi.",
    "",
    sections.join("\n\n"),
    "",
  ].join("\n");
};

export const isCatalogued = (relPath: string): boolean =>
  relPath.endsWith(".md") && relPath !== "CATALOG.md" && !relPath.split("/").includes("archive");

export const catalogVerdict = ({
  committed,
  expected,
  pageCount,
}: {
  readonly committed: string | undefined;
  readonly expected: string;
  readonly pageCount: number;
}): { readonly ok: boolean; readonly message: string } => {
  if (committed === undefined) {
    return {
      ok: false,
      message: "docs/CATALOG.md est absent. Lancez `pnpm generate` et committez le résultat.",
    };
  }
  if (committed !== expected) {
    return {
      ok: false,
      message:
        "docs/CATALOG.md n'est plus à jour. Lancez `pnpm generate` et committez le résultat.",
    };
  }
  return { ok: true, message: `docs/CATALOG.md est à jour (${pageCount} pages).` };
};
