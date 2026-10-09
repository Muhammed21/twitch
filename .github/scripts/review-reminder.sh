#!/usr/bin/env bash
# Solo project (ADR 0018): nobody else will notice a PR that stalls. Pings the author once an open PR has had no push
# for STALE_HOURS, with what the Review gate says: green and waiting for a merge, red, or no verdict.
# A new push clears review:stale, so the next stall pings again.
# Env: REPO. DRY_RUN=1 prints the edits instead. NOW (epoch seconds) overrides the clock for testing.
set -euo pipefail
source "$(dirname "$0")/review-config.sh"

: "${REPO:?}"
now="${NOW:-$(date +%s)}"

act() {
  if [ "${DRY_RUN:-0}" = "1" ]; then echo "dry-run: gh pr $*"; return; fi
  gh pr "$@" >/dev/null
}

gh pr list --repo "$REPO" --state open --limit 100 \
  --json number,isDraft,author,headRefOid,labels \
  -q '.[] | select(.isDraft | not) | select(.author.is_bot | not) | "\(.number) \(.author.login) \(.headRefOid) \([.labels[].name] | join(","))"' |
while read -r pr author sha labels; do
  has() { [[ ",$labels," == *",$1,"* ]]; }

  pushed_at=$(gh api "repos/$REPO/commits/$sha" -q .commit.committer.date)
  waited=$(( (now - $(jq -rn --arg t "$pushed_at" '$t | fromdate')) / 3600 ))

  if [ "$waited" -lt "$STALE_HOURS" ]; then
    has review:stale && act edit "$pr" --repo "$REPO" --remove-label review:stale
    continue
  fi
  has review:stale && continue

  gate=$(gh api "repos/$REPO/commits/$sha/check-runs?check_name=Review%20gate" \
    -q '[.check_runs[] | select(.status == "completed")] | sort_by(.completed_at) | last | .conclusion // empty')

  case "$gate" in
    success) what="Le gate de revue est vert depuis ${waited} h sans merge. Merge-la, ou ferme-la si elle n'a plus lieu d'être." ;;
    failure) what="Le gate de revue bloque depuis ${waited} h. Corrige les findings Important ou réponds-y avec une raison, puis pousse." ;;
    *) what="Aucun verdict du gate de revue depuis ${waited} h. Commente \`@claude review\` pour relancer la revue." ;;
  esac
  echo "#$pr: gate=${gate:-none}, ${waited}h since last push"
  act edit "$pr" --repo "$REPO" --add-label review:stale
  act comment "$pr" --repo "$REPO" --body "@$author $what"
done
