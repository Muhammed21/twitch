#!/usr/bin/env bash
# Refuses a release while a standard or critical PR in it merged without a green Review gate on its last commit
# (an admin merge, or a merge before the gate finished). Solo project: the gate stands in for the human review.
# The release holds every PR merged into HEAD_SHA and not into the previous v*.*.* tag.
# The maintainer lets one PR through with review:release-accepted.
# Env: REPO, HEAD_SHA (default HEAD). Needs full git history.
set -euo pipefail

: "${REPO:?}"
head="${HEAD_SHA:-$(git rev-parse HEAD)}"
prev=$(git describe --tags --abbrev=0 --match 'v*.*.*' "$head^" 2>/dev/null || true)
echo "release ${head:0:7}, previous release ${prev:-none}"

missing=()
while read -r pr pr_head merge_commit labels; do
  [ -n "$pr" ] || continue
  git cat-file -e "$merge_commit^{commit}" 2>/dev/null || continue
  git merge-base --is-ancestor "$merge_commit" "$head" || continue
  if [ -n "$prev" ] && git merge-base --is-ancestor "$merge_commit" "$prev"; then continue; fi
  [[ ",$labels," == *",review:release-accepted,"* ]] && { echo "#$pr: accepted without a green gate"; continue; }

  gate=$(gh api "repos/$REPO/commits/$pr_head/check-runs?check_name=Review%20gate" \
    -q '[.check_runs[] | select(.status == "completed")] | sort_by(.completed_at) | last | .conclusion // empty')
  if [ "$gate" = success ]; then echo "#$pr: gate green"; else missing+=("$pr"); fi
done < <(gh pr list --repo "$REPO" --state merged --base main --limit 300 \
  --search "label:review:standard,review:critical" \
  --json number,headRefOid,mergeCommit,labels \
  -q '.[] | "\(.number) \(.headRefOid) \(.mergeCommit.oid) \([.labels[].name] | join(","))"')

if [ ${#missing[@]} -gt 0 ]; then
  {
    echo "### Release blocked: merged without a green Review gate"
    for pr in "${missing[@]}"; do echo "- https://github.com/$REPO/pull/$pr"; done
    echo
    echo "Review each PR again, or add \`review:release-accepted\` to it, then run the release again."
  } >> "${GITHUB_STEP_SUMMARY:-/dev/stdout}"
  echo "::error::${#missing[@]} PR(s) in this release merged without a green Review gate: ${missing[*]/#/#}"
  exit 1
fi
echo "Release review check: pass"
