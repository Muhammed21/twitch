#!/usr/bin/env bash
# Decides whether the PR may merge under its review tier. Solo project (ADR 0018): no human approval, Claude is the reviewer.
# The tier is the higher of the path floor (the label the tier job left) and the tier in Claude's summary.
# low: Claude's findings never block. standard and critical: any Important finding blocks.
# Env: REPO, PR. DRY_RUN=1 prints the edits instead.
set -euo pipefail

: "${REPO:?}" "${PR:?}"

fail() { echo "::error::$*"; exit 1; }
edit_pr() {
  if [ "${DRY_RUN:-0}" = "1" ]; then echo "dry-run: gh pr edit $PR $*"; return; fi
  gh pr edit "$PR" --repo "$REPO" "$@" >/dev/null
}
rank() { case "$1" in critical) echo 2 ;; standard) echo 1 ;; *) echo 0 ;; esac; }

pr=$(gh api "repos/$REPO/pulls/$PR")
sha=$(jq -r .head.sha <<<"$pr")
author_is_bot=$(jq -r '.user.type == "Bot"' <<<"$pr")
labels=$(jq -r '[.labels[].name] | join(" ")' <<<"$pr")
has() { [[ " $labels " == *" $1 "* ]]; }

tier=low
if has review:critical; then tier=critical; elif has review:standard; then tier=standard; fi
echo "floor=$tier head=${sha:0:7}"

if has review:oversized && ! has review:oversized-accepted; then
  fail "Over the size ceiling. Split this PR, or add review:oversized-accepted."
fi

if [ "$author_is_bot" = true ]; then
  [ "$tier" = low ] || fail "A bot PR on a $tier path. Review it, then add review:self-accepted."
  echo "Review gate: pass (bot PR on low paths, CI is the filter)"
  exit 0
fi

# claude-code-action skips when the PR's review workflow differs from the default branch's.
default_branch=$(jq -r .base.repo.default_branch <<<"$pr")
workflow_blob() { gh api "repos/$REPO/contents/.github/workflows/pr-review.yml?ref=$1" -q .sha 2>/dev/null || echo none; }
# Compare the test merge, as Actions runs it: a branch cut before the workflow landed still merges main's copy.
merged_ref=$(jq -r '.merge_commit_sha // empty' <<<"$pr")
if [ "$(workflow_blob "$default_branch")" != "$(workflow_blob "${merged_ref:-$sha}")" ]; then
  has review:self-accepted && { echo "Review gate: pass (review workflow changed, review:self-accepted)"; exit 0; }
  fail "The review workflow here differs from $default_branch, so Claude cannot review this PR. Review it yourself, then add review:self-accepted."
fi

body=$(gh api "repos/$REPO/issues/$PR/comments" --paginate -q "
  [.[] | select((.user.login == \"claude[bot]\" or .user.login == \"claude\") and (.body | contains(\"reviewed: $sha\")))]
  | last | .body // empty" | tr -d '\r')
[ -n "$body" ] || fail "No Claude review for ${sha:0:7} yet. Wait for the Claude review job, or comment '@claude review'."
summary=$(head -n1 <<<"$body")
tier_line=$(grep -m1 -E '^Tier: (critical|standard|low)' <<<"$body" || true)

if [[ "$summary" =~ ^No\ blocking\ issues ]]; then
  important=0
elif [[ "$summary" =~ ^([0-9]+)\ important ]]; then
  important=${BASH_REMATCH[1]}
else
  fail "Claude's summary line for ${sha:0:7} is not readable: '$summary'."
fi
[ -n "$tier_line" ] || fail "Claude's review for ${sha:0:7} states no tier. Comment '@claude review'."
echo "claude: $summary"
echo "claude: $tier_line"

claude_tier=$(sed -E 's/^Tier: (critical|standard|low).*/\1/' <<<"$tier_line")
if [ "$(rank "$claude_tier")" -gt "$(rank "$tier")" ]; then
  edit_pr --add-label "review:$claude_tier" --remove-label "review:$tier"
  echo "tier raised by Claude: $tier -> $claude_tier"
  tier=$claude_tier
fi

if [ "$tier" = low ]; then
  echo "Review gate: pass (low; Claude's findings do not block)"
  exit 0
fi

[ "$important" -eq 0 ] || fail "$important Important finding(s) from Claude on ${sha:0:7}. Fix them, or answer each with a reason, then push."

echo "Review gate: pass ($tier)"
