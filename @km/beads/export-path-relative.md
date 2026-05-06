---
mentions:
  - km
  - claude
id: "@km/beads/export-path-relative"
aliases:
  - km-beads.export-path-relative
  - km-beads-export-path-relative
created_by: claude:cc081a9a
created_at: 2026-04-28T05:06:23Z
closed_at: 2026-04-28T06:48:08Z
close_reason: >-
  Root cause: bd v1.0.2's pre-commit hook resolved `export.path =
  "issues.jsonl"` against the worktree CWD instead of `.beads/`, causing `git
  update-index` to add a stray ~9 MB `issues.jsonl` at repo root. The file never
  appeared on disk (so .gitignore couldn't help — `update-index --cacheinfo`
  bypasses gitignore), but the index entry produced a stray file in every
  commit.


  Diagnosis trace:

  - Reproduced bug in fresh worktree at `.claude/worktrees/bd-export-hook` with
  bare `git commit` — observed `issues.jsonl | 4687 +++++` in commit, but `ls
  issues.jsonl` returned no such file.

  - Manual `bd hooks run pre-commit` did NOT reproduce; only `git commit` did.

  - Isolated to: when `GIT_DIR` and `GIT_INDEX_FILE` env vars are set (as during
  a real git commit), bd's pre-commit hook calls `git add issues.jsonl` (the
  bare config value), which git resolves against worktree CWD = repo root,
  creating an index entry pointing to the actual `.beads/issues.jsonl` blob.

  - Confirmed via `git ls-files --stage` showing both `issues.jsonl` (root) and
  `.beads/issues.jsonl` (canonical) sharing the same git blob hash.


  Already fixed upstream: filed as steveyegge/beads#3311 ("export.git-add=true
  recreates issues.jsonl at project root in worktrees without redirect"), fixed
  in bd v1.0.3 (commit d0f0ad6f, "fix(export): scrub git hook env and skip
  cross-worktree git-add").


  Resolution:

  1. Upgraded `bd` 1.0.2 → 1.0.3 via `brew upgrade beads` — primary fix;
  verified that post-upgrade commits in worktrees no longer produce stray
  `issues.jsonl` at root.

  2. Added defense-in-depth check
  `packages/km-infra/scripts/check-no-stray-issues-jsonl.sh` + matching
  `packages/km-infra/tests/no-stray-issues-jsonl.test.ts`, wired into both `bun
  fix` and `test:ci`.

  3. Registered tracking bead `km-beads.upstream-bd-1.0.3-export-path` (parent:
  km-all.upstream-waiting, defer: 2026-05-27, escalate: 2026-10-27) so the
  defense-in-depth gate is removed once bd >=1.0.3 is universal across all dev
  environments.


  Verification:

  - Commit `c4e3a7eaae6a71e650d747915c13e839dc7f3d33` on branch
  `bug/bd-export-path-relative` (pushed to origin).

  - Post-upgrade test commit `134f6469d` in the same branch: 2 files modified
  (.beads/issues.jsonl + test-after-upgrade.txt), zero stray `issues.jsonl` at
  root.

  - check-no-stray-issues-jsonl.sh passes when no stray exists; tested
  separately catching a deliberately-staged stray.

  - bd version reports `bd version 1.0.3 (Homebrew)`.


  Cleanup remaining (NOT part of this bead's scope):

  - Local main has commit `aff8d9bfa stray` that I accidentally created during
  diagnosis (mktemp template error caused git init to run in main repo CWD).
  Branch is 1 commit ahead of origin/main with a stray issues.jsonl. Surfaced
  for user to revert; not pushed to origin.
closeReason: Obsoleted by cutover — Go bd binary is gone, the
  export-path-relative bug class no longer applicable.
started_at: 2026-04-28T06:16:37Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
dependencies:
  - issue_id: km-beads.export-path-relative
    depends_on_id: km-beads.cutover
    type: parent-child
    created_at: 2026-04-27T22:06:48Z
    created_by: claude:cc081a9a
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-beads.cutover
---

# [x] bd export hook writes issues.jsonl to worktree root instead of .beads/ — three agents hit it concurrently @km/beads #bug #P2 @claude:cc081a9a

blocks:: [[@km/beads/cutover]]

## Symptom

bd's pre-commit / post-commit hook (or git config) writes 'issues.jsonl' to the repository root instead of '.beads/issues.jsonl' inside worktree clones (.claude/worktrees/<name>/). Three concurrent agents hit this in a single /max session (2026-04-28):

1. acp-wire-fixer: had to commit one cleanup with 'core.hooksPath=/dev/null' because the hook repeatedly re-added a stray 4679-line dup at root.
2. mcp-tribe-plugin: caught the staging in a commit, amended locally before push.
3. signal-hang-hunter (potentially): work-in-progress.

## Suspected root cause

bd config has 'export.path: "issues.jsonl"' (relative). In the main worktree git treats CWD as repo root, so 'issues.jsonl' lands at root. Should be '.beads/issues.jsonl' or absolute path resolution should be relative to '.beads/' not CWD.

## Acceptance

- 'issues.jsonl' never lands at repo root in any worktree
- bd config docs clarify export.path resolution semantics
- Hook either resolves relative to '.beads/' OR uses an absolute path
- Add a sanity check that errors loudly if 'issues.jsonl' detected at root

