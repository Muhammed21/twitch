#!/usr/bin/env bash
# The PR's review threads, around the Claude review.
#   dump FILE  writes every thread, resolved or not, with its comments, for the review to read.
#   resolve    resolves each open Claude thread whose last comment is Claude's `✅ Fixed` reply.
# Env: REPO, PR. DRY_RUN=1 prints the threads it would resolve instead.
set -euo pipefail

: "${REPO:?}" "${PR:?}"

threads() {
  gh api graphql -F owner="${REPO%/*}" -F name="${REPO#*/}" -F pr="$PR" -f query='
    query($owner: String!, $name: String!, $pr: Int!) {
      repository(owner: $owner, name: $name) {
        pullRequest(number: $pr) {
          reviewThreads(first: 100) {
            nodes {
              id isResolved isOutdated path line
              comments(first: 100) { nodes { databaseId author { login } url body } }
            }
          }
        }
      }
    }' -q '[.data.repository.pullRequest.reviewThreads.nodes[] | {
      threadId: .id, resolved: .isResolved, outdated: .isOutdated, path, line,
      comments: [.comments.nodes[] | {id: .databaseId, author: .author.login, url, body}]
    }]'
}

case "${1:-}" in
  dump)
    : "${2:?dump needs a file}"
    threads >"$2"
    echo "$(jq length "$2") review thread(s) written to $2"
    ;;
  resolve)
    # GraphQL names the Claude app `claude`; REST names it `claude[bot]`.
    fixed=$(threads | jq -r '.[]
      | select(.resolved | not)
      | select(.comments[0].author == "claude" and .comments[-1].author == "claude")
      | select(.comments | length > 1)
      | select(.comments[-1].body | startswith("✅ Fixed"))
      | .threadId')
    for id in $fixed; do
      if [ "${DRY_RUN:-0}" = "1" ]; then echo "dry-run: resolve $id"; continue; fi
      gh api graphql -f id="$id" -f query='
        mutation($id: ID!) { resolveReviewThread(input: {threadId: $id}) { thread { isResolved } } }' >/dev/null
      echo "resolved $id"
    done
    ;;
  *)
    echo "usage: $0 dump FILE | resolve" >&2
    exit 2
    ;;
esac
