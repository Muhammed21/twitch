#!/usr/bin/env bash
# Keeps one review tier label on the PR (the highest; low when none), measures its size, and sets review:oversized.
# Env: REPO, PR. DRY_RUN=1 prints the label edits instead of applying them.
set -euo pipefail
source "$(dirname "$0")/review-config.sh"

: "${REPO:?}" "${PR:?}"

edit_labels() {
  if [ "${DRY_RUN:-0}" = "1" ]; then echo "dry-run: gh pr edit $PR $*"; return; fi
  gh pr edit "$PR" "$@" >/dev/null
}

labels=$(gh api "repos/$REPO/pulls/$PR" -q '[.labels[].name] | join(" ")')
has() { [[ " $labels " == *" $1 "* ]]; }

tier=low
if has review:critical; then tier=critical; elif has review:standard; then tier=standard; fi
remove=()
for t in critical standard low; do
  [ "$t" != "$tier" ] && has "review:$t" && remove+=("review:$t")
done
has "review:$tier" || edit_labels --add-label "review:$tier"
[ ${#remove[@]} -gt 0 ] && edit_labels --remove-label "$(IFS=,; echo "${remove[*]}")"

# Lines of code: docs, lockfile, images, generated tokens and SQL migrations do not count.
lines=$(gh api "repos/$REPO/pulls/$PR/files" --paginate -q '
  [.[] | select(
    (.filename | test("^docs/|\\.md$|^pnpm-lock\\.yaml$|\\.png$|^packages/design-tokens/platforms/|/migrations/.*\\.sql$")) | not
  ) | .additions + .deletions] | add // 0' | paste -sd+ - | bc)

oversized=false
if [ "$lines" -gt "$SIZE_CEILING_LINES" ] && ! has review:oversized-accepted; then
  oversized=true
  has review:oversized || edit_labels --add-label review:oversized
  echo "::warning::$lines lines of code, ceiling is $SIZE_CEILING_LINES. Split this PR, or add review:oversized-accepted."
else
  has review:oversized && edit_labels --remove-label review:oversized
fi

{
  echo "tier=$tier"
  echo "lines=$lines"
  echo "oversized=$oversized"
} >> "${GITHUB_OUTPUT:-/dev/stdout}"
