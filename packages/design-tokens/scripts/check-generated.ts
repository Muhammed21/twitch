import { execFileSync, spawnSync } from "node:child_process";

const GENERATED = ["platforms/swift"];

execFileSync("node", ["./scripts/build.ts"], { stdio: "inherit" });

const diff = spawnSync("git", ["diff", "--stat", "--", ...GENERATED], {
  encoding: "utf8",
});
const untracked = execFileSync(
  "git",
  ["ls-files", "--others", "--exclude-standard", "--", ...GENERATED],
  {
    encoding: "utf8",
  },
);

if (diff.status !== 0 || diff.stdout.trim() !== "" || untracked.trim() !== "") {
  process.stderr.write(
    [
      "Generated tokens are out of date.",
      "Run `pnpm --filter @repo/design-tokens build` and commit the result.",
      "",
      diff.stdout,
      untracked,
    ].join("\n"),
  );
  process.exit(1);
}
