---
id: "@km/all/lint-env-worktree-scan"
aliases:
  - km-all.lint-env-worktree-scan
  - km-all-lint-env-worktree-scan
created_by: claude:da9990c5
created_at: 2026-04-28T20:42:49Z
closed_at: 2026-04-28T20:49:38Z
close_reason: >-
  Fixed by adding `.claude` to IGNORED_DIRS in both vendor/silvery tree-walking
  lint scripts.


  Root cause: `lint-env-reads.ts` and `lint-layout-reads.ts` walk from
  `repoRoot` (vendor/silvery/) and only excluded build/output dirs
  (node_modules, dist, .git, docs, etc.). They walked into
  `vendor/silvery/.claude/worktrees/<id>/` — isolated copies of the repo
  materialized by `bun worktree create <bead>` for parallel agent runs. Other
  agents' WIP code got reported as violations, 100% false-positive rate.


  Fix:

  - vendor/silvery commit 0d935e05 — added `.claude` to IGNORED_DIRS in
  scripts/lint-env-reads.ts AND scripts/lint-layout-reads.ts (sibling pattern).
  Same grammar the linters already used (Set<string> entry name match in
  `walk()`).

  - km commit e12f8ee49 — bump vendor/silvery submodule pointer.

  - Pushed: silvery main 0d935e05; km feat/km-silvercode.tool-call-rendering-v2
  e12f8ee49.


  Verification (2 agent worktrees present in vendor/silvery/.claude/worktrees/):

  - BEFORE: `bun vendor/silvery/scripts/lint-env-reads.ts` → 14 violations (all
  under `.claude/worktrees/...`); `vitest --project=vendor
  vendor/silvery/tests/lint-env-reads.test.ts` → 2 failed / 4 passed.

  - AFTER: `bun vendor/silvery/scripts/lint-env-reads.ts` → 0 violations across
  1049 files; `bun vendor/silvery/scripts/lint-layout-reads.ts` → 0 violations
  across 598 files; `vitest --project=vendor
  vendor/silvery/tests/lint-env-reads.test.ts` → 6/6 passing.

  - Genuine env-reads still caught: tests `detects a deliberate
  process.env.TERM_PROGRAM read in a non-allowlisted file` and `detects a
  deliberate process.env.COLORTERM read via dynamic access` both still pass —
  the lint correctly returns code 1 when a fixture violation is dropped under
  packages/ag-term/src/.

  - Grep confirms exclude is in place: `grep -n .claude
  vendor/silvery/scripts/lint-{env,layout}-reads.ts` returns the new entries in
  both IGNORED_DIRS sets.


  Sibling lint script `lint-no-async-unmount.ts` was reviewed but does NOT need
  the fix — it walks specific subdirs only (`packages/`, `src/`, `examples/`,
  `apps/`, `bin/`, `components/`, `layout/`), never touches `.claude/`.
started_at: 2026-04-28T20:46:24Z
owner: bjorn@stabell.org
assignee: claude:da9990c5
dependencies:
  - issue_id: km-all.lint-env-worktree-scan
    depends_on_id: km-all
    type: parent-child
    created_at: 2026-04-28T13:42:55Z
    created_by: claude:da9990c5
    metadata: "{}"
---

# [x] lint-env-reads scans .claude/worktrees/ and trips on sibling agents' isolated copies @km/all #bug #P0 @claude:da9990c5

blocks:: [[@km/all]]

Surfaced by @km/_orphan/yej6 (column-resize STRICT mismatch) silvery agent run.

## Symptom

vendor/silvery/tests/lint-env-reads.test.ts (2 tests) fails because the linter scans .claude/worktrees/ — which is where bun worktree creates isolated copies for parallel agent runs. Other agents' worktrees may legitimately have env-reads in WIP code, and the linter reports them as if they were violations in the user's main checkout.

This is an infrastructure hygiene bug, not a real env-read violation.

## Root cause

The lint-env-reads scanner doesn't exclude .claude/worktrees/ from its scan path. Worktrees are sibling checkouts (created via bun worktree create), not part of the canonical source tree. They contain in-progress agent work that is not yet committed and may legitimately fail any in-progress check.

## Why P0

Causes false-positive failures in CI / preflight runs whenever a parallel agent has an active worktree. Blocks the silvery STRICT compliance signal because preflight fails for non-substantive reasons. Fix is small (add exclude path to the linter's scan glob) but the false-positive rate is 100% under multi-agent workflows — which is the standard mode of operation now.

## Reproduction

  cd /Users/beorn/Code/pim/km
  bun vitest run vendor/silvery/tests/lint-env-reads.test.ts

Fails when any active .claude/worktrees/agent-* directory exists with env-reads in its WIP code.

## Investigation start

- vendor/silvery/tests/lint-env-reads.test.ts — the linter test file
- Find the source-tree-walking helper it uses; check whether it already accepts an excludes param
- Add .claude/worktrees/, node_modules/, and any other sibling-checkout-style paths to the default exclude list
- Cross-reference with other lint-* tests in vendor/silvery/tests/ — same fix likely applies

## /complete criteria

- [ ] vendor/silvery/tests/lint-env-reads.test.ts passes when .claude/worktrees/ contains agent worktrees
- [ ] Pattern applied to any other lint-* tests with the same scan-the-tree shape
- [ ] grep confirms .claude/worktrees/ is in the linter's excluded paths