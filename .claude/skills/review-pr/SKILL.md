---
name: review-pr
description: Review a pull request of this repo locally, as a draft in chat. Use when asked to review a PR, look at a PR, check a diff before merge, or re-review a PR. Applies REVIEW.md, and adds what the CI review cannot do on GitHub - the linked issue, running the gates, and a device pass.
---

# Review a PR

The `pr-review` workflow already reviews PRs on GitHub with `REVIEW.md`. This skill is the local review: same rules, plus the checks that need the issue, a run, or a device.

## Rules

- `REVIEW.md` is the list of rules. Read it first, and apply it as written.
- Post nothing to GitHub unless the user says "post it". Then post exactly what they approved.
- Never say you checked something you did not check. If a check was partial, say what it proves and what it does not.

## 1. Get the PR

```bash
PR=<number>   # default: gh pr view --json number -q .number
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
gh pr view $PR --json number,title,body,baseRefName,headRefName,headRefOid,additions,deletions,changedFiles,mergeable,statusCheckRollup,labels
gh pr diff $PR
gh pr view $PR --json comments,reviews
gh api repos/$REPO/pulls/$PR/comments --paginate \
  -q '.[] | "\(.user.login)\t\(.path):\(.line)\t\(.body)"'
```

Do not repeat a finding already posted, by the CI review or by anyone.

Use three dots when you diff with git: `git diff origin/main...<head>`. Two dots on a branch behind `main` show what `main` gained as deletions.

A re-review looks only at the commits after the last review. For each answered finding, check that the fix removes the problem and does not only make it smaller.

## 2. Gate

Stop and send the PR back if one of these fails:

- More than one subject, or more than ~600 lines of code (docs, lockfile and generated tokens not counted). Over 1200, CI marks it `review:oversized`.
- A commit whose scope is not in `commitlint.config.mjs`, or that names several bounded contexts: the frontier of ADR 0003 leaks.
- Merge conflicts, or commits from another branch in the diff.

## 3. Checks only a local review can do

- Issue: every `- [ ]` in the linked issue (`gh issue view <n>`) is proven by the diff or by test output.
- Gates: run `pnpm lint`, `pnpm check-types`, `pnpm test` (or `pnpm exec turbo run test --filter=<package>`), and `pnpm generate` followed by `git status --porcelain`. Report the numbers, and say what you did not run.
  - The repo pins Node in `.node-version`; switch to it first.
  - `pnpm test:infra` needs Docker running.
  - `pnpm bench` runs the micro-benches; CI posts their diff against `main` on the PR.
- Test sensitivity, when only a run can tell: copy the file to the session scratch directory, change it, run the suite, copy it back, and check that `git status --porcelain` is empty. For a whole package, `pnpm --filter <package> mutation` runs Stryker.
- Device pass, only when the user asks or the PR is about feel: run it on the simulator and report with screenshots.

## 4. Draft

Write the findings as `REVIEW.md` §Comment écrire says, in this shape:

```md
## Gate

<omit when the PR passes>

## Important

### `path/to/file.ts:42`

<état de départ → entrée → mauvais résultat>. <le correctif>

## Nits

### `path/to/file.ts:17`

<finding>

## Not checked

<device, a suite you did not run>
```

Then the verdict for the user: changes requested, comment, or approve. The user decides.
