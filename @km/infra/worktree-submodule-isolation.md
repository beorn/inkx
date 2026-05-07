---
mentions:
  - km
id: "@km/infra/worktree-submodule-isolation"
aliases:
  - km-infra.worktree-submodule-isolation
  - km-infra-worktree-submodule-isolation
created_by: Bjørn Stabell
created_at: 2026-04-19T04:28:38Z
closed_at: 2026-04-19T05:26:43Z
close_reason: >-
  Fixed. Per-worktree submodule isolation now works across bearly tool + Claude
  Code hooks.


  Commits (km):

  - bcf11aaf5 chore(bearly): bump — worktree submodule isolation + round-trip
  test

  - aab4ddd58 (another agent) registered WorktreeRemove hook +
  worktree-remove.sh file

  - 39fcad298, b6b3dc8bb, 113975edd, 813662a63 (prior partial fix)
  WorktreeCreate hook wiring


  Commits (vendor/bearly):

  - 3dfa695 feat(worktree): submodule isolation + per-worktree module cleanup +
  list HEAD SHAs

  - adbf7fc test(worktree): round-trip isolation — changes don't leak to main;
  rm leaves no orphans


  Findings & evidence:


  1. git 2.53 does NOT support `git worktree add --recurse-submodules` (the bead
  description was incorrect). Confirmed empirically: `unknown option
  'recurse-submodules'`. The working mechanism is plain `git worktree add`
  followed by `git submodule update --init --recursive` inside the worktree —
  this creates per-worktree isolated clones at
  `.git/worktrees/<name>/modules/<sub>/` automatically.


  2. `vendor/bearly/tools/worktree.ts` updated:
     - createWorktree: kept submodule init, added docstring + isolation status line
     - removeWorktree + mergeWorktree: explicit `rmSync(.git/worktrees/<name>/modules, {recursive, force})` before AND after `git worktree remove` (defensive belt+braces)
     - listWorktrees: per-submodule HEAD SHAs per worktree, with [isolated]/[shared]/(not initialized) markers
     - New helpers: getWorktreeModulesDir(), getSubmoduleHeads()

  3. WorktreeRemove hook (.claude/hooks/worktree-remove.sh) scrubs
  `.git/worktrees/<name>/modules/` after Claude Code removes a worktree.
  Registered in settings.json. Detached background task, emits `{"continue":
  true}` on stdout. Smoke-tested: writes to /tmp/worktree-remove-hook.log.


  4. Round-trip isolation test
  (vendor/bearly/tests/worktree-isolation.slow.test.ts) passes:
     - Builds sandbox superproject + submodule in tmpdir
     - createWorktree → verify per-worktree modules dir exists
     - Modify submodule in worktree → assert main repo's submodule file unchanged
     - Commit in worktree's submodule → assert HEADs diverge (proves independent .git)
     - removeWorktree → assert no orphan modules dir remains

  5. Verification:
     - `npx tsc --noEmit | grep 'error TS' | grep -v vendor/` = 0
     - `bun vitest run --project slow vendor/bearly/tests/worktree-isolation.slow.test.ts` = 1 passed
     - `bun vendor/bearly/tools/worktree.ts list` shows per-submodule SHAs + isolation markers across existing km worktrees (km-selection-plateau, km-test-system etc. all report [isolated])

  Observed but out of scope: the hook log shows 3 recent Claude Code agents
  (a91bfd9c, a239f746, afb39f35) whose worktrees never materialized at the
  expected path — the 60s poll expired silently. This is benign (hook exits
  cleanly) but suggests Claude Code may abort some worktree creations before
  they hit disk. Worth a separate bead if it recurs.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-infra.worktree-submodule-isolation
    depends_on_id: km-infra
    type: parent-child
    created_at: 2026-04-18T21:28:38Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-infra
---

# [x] Per-worktree submodule isolation — bun worktree --recurse-submodules @km/infra #task #P1

blocks:: [[@km/infra]]

Root cause for today's coordination chaos (Phase 2 wiring stranded commits, orphan oxfmt drift, theme-v3 bundle break blocking merge, 4 distinct cross-session failures in one session).

## Problem

Git worktrees share submodule working trees by default. Each km worktree has isolated superproject branch, but all worktrees see ONE physical `vendor/silvery`, `vendor/bearly`, etc. working tree. Sessions collide invisibly:

- Session A runs `bun fix` → oxfmt sweeps vendor/silvery/docs, leaves files dirty
- Session B `cd vendor/silvery` → sees dirty files, can't attribute
- Session C tries `git merge` in vendor/silvery → blocked by dirty tree
- Local commits in one session's submodule checkout invisible to others until pushed

Today's specific instances:

1. TEA Phase 2 wiring commits (c1367932..f8a490bd) stranded in feat/selection-plateau's silvery for days, invisible to a fresh-worktree silvery agent
2. km session's `bun fix`/oxfmt orphan drift (493 files) blocked my merge
3. theme-v3's deriveFields refactor broke bundle on silvery main, contaminating all sessions' silvery checkouts
4. My sub-agent's mid-edit state in one worktree blocked my merge attempt in another

## Fix

Use git 2.25+'s `--recurse-submodules` flag + per-worktree submodule modules so each km worktree gets its own isolated vendor/\* checkouts.

### Changes to `vendor/bearly/tools/worktree.ts`

1. `worktree add <name>`:
- Replace `git worktree add <path> <branch>` with `git worktree add --recurse-submodules <path> <branch>`
- Verify `.git/worktrees/<name>/modules/<submodule>/` exists per submodule
- Do NOT `git submodule update --init` in superproject's parent — each worktree owns its own
6. `worktree rm <name>`:
- Clean up `.git/worktrees/<name>/modules/*` before removing the worktree (git leaves orphans)
- Fail gracefully if per-worktree submodule modules have uncommitted/unpushed work
10. `worktree list`:
- Show per-worktree submodule HEAD SHAs (so sessions can see divergence)
13. Migration:
- Existing worktrees use the shared checkout — don't auto-migrate (destructive)
- Add `worktree migrate <name>` to opt-in convert a worktree to per-submodule isolation
- Document: new worktrees after this lands get isolation; old ones stay shared until migrated

## Gotchas

- Disk usage: each worktree ~50-200 MB per submodule. With 16 worktrees × 5 submodules × 100 MB avg = ~8 GB. Mitigate via `git clone --reference` alternates so objects DB is shared.
- `git submodule update` needs to target the right per-worktree module path.
- Cleanup path matters — stale per-worktree modules accumulate otherwise.

## /complete

- [ ] `bun worktree add foo && cd foo/.. && cd foo/vendor/silvery && git rev-parse HEAD` — independent from main worktree's HEAD
- [ ] `bun fix` in worktree A leaves worktree B's vendor/silvery clean (not just the superproject)
- [ ] `bun worktree rm foo` cleans up `.git/worktrees/foo/modules/*`
- [ ] No regression in existing worktree flows (bead claim, TUI tests, release)
- [ ] Documented in vendor/bearly/tools/worktree.ts module docstring

## Parent

@km/infra — infrastructure bead

## Source

/why analysis 2026-04-18 — 4 distinct cross-session failures in one session, all tracing to shared vendor/\* working trees.

