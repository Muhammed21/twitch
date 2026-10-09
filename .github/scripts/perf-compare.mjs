#!/usr/bin/env node
// Compares two merged vitest bench outputs (PR vs main baseline) and prints a markdown diff.
// Informative only: never exits non-zero on a regression, never gates the merge.
// Usage: node .github/scripts/perf-compare.mjs <pr.json> [baseline.json]

import { readFileSync } from "node:fs";

const HEADER = "<!-- twitch:perf-compare -->";
const TITLE = "### perf — micro-bench";

const prettifyGroup = (fullName) => fullName.replace(/ > bench\/[^>]*\.bench\.ts >/, " >");

const readBench = (path) => {
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    const rows = (data.files ?? []).flatMap((file) =>
      (file.groups ?? []).flatMap((group) =>
        (group.benchmarks ?? []).map((benchmark) => ({
          section: prettifyGroup(group.fullName),
          key: `${group.fullName}::${benchmark.name}`,
          name: benchmark.name,
          metrics: {
            median: benchmark.median,
            p99: benchmark.p99,
            mean: benchmark.mean,
            hz: benchmark.hz,
            sampleCount: benchmark.sampleCount,
            rme: benchmark.rme,
          },
        })),
      ),
    );
    return { rows, byKey: new Map(rows.map((row) => [row.key, row.metrics])) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
};

const sections = (rows) =>
  [...new Set(rows.map((row) => row.section))].map((section) => ({
    section,
    rows: rows.filter((row) => row.section === section),
  }));

const fmtMs = (n) => (n == null || Number.isNaN(n) ? "—" : `${n.toFixed(4)}ms`);

const fmtDelta = (pr, base) => {
  if (base == null || pr == null || base === 0) return "—";
  const delta = ((pr - base) / base) * 100;
  const arrow = delta > 5 ? " 🔺" : delta < -5 ? " 🟢" : "";
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%${arrow}`;
};

const prOnlyTable = ({ section, rows }) => [
  `#### \`${section}\``,
  "",
  "| benchmark | median | p99 | mean | hz | n | rme |",
  "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ...rows.map(
    ({ name, metrics: m }) =>
      `| \`${name}\` | ${fmtMs(m.median)} | ${fmtMs(m.p99)} | ${fmtMs(m.mean)} | ${m.hz?.toFixed(2) ?? "—"} | ${m.sampleCount ?? "—"} | ±${m.rme?.toFixed(2) ?? "—"}% |`,
  ),
  "",
];

const diffTable =
  (baseByKey) =>
  ({ section, rows }) => [
    `#### \`${section}\``,
    "",
    "| benchmark | median (PR) | median (main) | Δ | p99 (PR) | p99 (main) | Δ |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows.map(({ name, metrics: m, key }) => {
      const b = baseByKey.get(key);
      return `| \`${name}\` | ${fmtMs(m.median)} | ${fmtMs(b?.median)} | ${fmtDelta(m.median, b?.median)} | ${fmtMs(m.p99)} | ${fmtMs(b?.p99)} | ${fmtDelta(m.p99, b?.p99)} |`;
    }),
    "",
  ];

const noBaselineReason = (basePath, base) => {
  if (!basePath) return "no baseline path supplied";
  if (base.error) return `baseline unreadable (${base.error})`;
  if (base.rows.length === 0) return "baseline contains no benchmarks";
  return undefined;
};

const render = (prPath, basePath) => {
  const pr = readBench(prPath);
  if (pr.error) return [HEADER, TITLE, "", `_PR bench artifact unreadable: ${pr.error}_`];
  if (pr.rows.length === 0) return [HEADER, TITLE, "", "_No benchmarks found in PR artifact._"];

  const base = basePath ? readBench(basePath) : { rows: [], byKey: new Map() };
  const reason = noBaselineReason(basePath, base);
  const body =
    reason === undefined
      ? sections(pr.rows).flatMap(diffTable(base.byKey))
      : [
          `_No baseline yet — ${reason}. Showing PR run only._`,
          "",
          ...sections(pr.rows).flatMap(prOnlyTable),
        ];
  const orphans =
    reason === undefined ? [...base.byKey.keys()].filter((key) => !pr.byKey.has(key)).length : 0;

  return [
    HEADER,
    TITLE,
    "",
    ...body,
    ...(orphans > 0 ? [`_Baseline-only benchmarks (removed or renamed): ${orphans}_`, ""] : []),
    "_Informative only — never gates merge. Source: `vitest bench` output._",
  ];
};

const [, , prPath, basePath] = process.argv;
if (!prPath) {
  console.error("usage: perf-compare.mjs <pr.json> [baseline.json]");
  process.exit(2);
}
console.log(render(prPath, basePath).join("\n"));
