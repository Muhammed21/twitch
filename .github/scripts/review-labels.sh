#!/usr/bin/env bash
# Creates the review labels the tier and gate scripts set, so that `gh pr edit --add-label` never fails on a fresh repo.
# Env: REPO.
set -euo pipefail

: "${REPO:?}"

label() { gh label create "$1" --repo "$REPO" --color "$2" --description "$3" --force >/dev/null; }

label review:low 0e8a16 "Review tier: Claude's findings never block"
label review:standard fbca04 "Review tier: Claude's Important findings block the merge"
label review:critical b60205 "Review tier: Claude's Important findings block; touches auth, money, data or CI"
label review:oversized d93f0b "Over the PR size ceiling"
label review:oversized-accepted c5def5 "The maintainer accepts this PR's size"
label review:self-accepted c5def5 "The maintainer merges without Claude's review (the review workflow itself changed)"
label review:stale ededed "No push for a day: merge, fix or close"
label review:release-accepted c5def5 "The maintainer releases this PR without a green Review gate"
