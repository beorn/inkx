# Worktree hygiene — preventive policy and tooling #infra #P1

## Why this exists

2026-05-08 cleanup pass found 7 active worktrees (wt2..wt8) with these pathologies:

- **wt2**: stale branch, 0 unique commits, 89 behind main, kept around for unclear reasons.
- **wt3**: 426 behind, 2 unique commits — 1 real refactor (data.tags→links table) parked 4 days, 1 throwaway "checkpoint".
- **wt4**: 459 commits ahead of `origin/wt4`, 8 stale commits already applied upstream (force-push needed); was in detached-HEAD with unmerged conflicts before another agent groomed it.
- **wt5, wt7**: branches retained commits that had already been rebased/cherry-picked onto main (cherry-prefix `-`). Working trees showed identical formatter-noise dirt across all worktrees because `bun fix` ran in each independently.
- **wt6**: abandoned mid-rebase with `UU` conflicts on `apps/km-tui/tests/CLAUDE.md` and `apps/km-tui/tests/helpers/real-board.ts`.
- **wt8**: 1 unique commit that was a duplicate of `897ec7bfe` (main applied it manually with a different stat).

Five of the seven worktrees were unilaterally nuke-able (no unique work). The cleanup is a recurring tax — agents land work on main via cherry-pick or manual reapply but don't reset the source branch; rebases get abandoned mid-conflict; formatter passes run per-worktree creating identical-bytes dirt that masquerades as WIP.

## Acceptance — tooling

- **`bun worktree audit`** command (in `vendor/bearly/tools/` or `packages/km-infra/scripts/`) that flags, per worktree:
  - detached HEAD with `UU` (unmerged) files
  - branches with cherry `-`-only commits (already-landed dups)
  - identical-byte dirty files across multiple worktrees (formatter-noise pattern)
  - branches >100 commits behind main
  - mid-rebase / mid-merge state (`.git/rebase-*` exists)
  - last-commit-ago > 14 days on a branch with unique commits
- Runs by default from `/sop infra` weekly, surfaced via `/daily`.

## Acceptance — workflow

- **Post-merge auto-reset**: when `/merge` (or any pathway that lands a wt branch's work to main via cherry-pick / manual reapply) confirms the source commit is on main, automatically `git reset --hard main` the wt branch. The `release-script-not-agent` lesson generalizes here.
- **Pre-commit guard**: refuse to commit on detached HEAD when there are `UU` files. Force the user to `rebase --abort` or resolve before committing — clarifies the recovery path.
- **SessionStart drift report**: surface `git worktree list` + per-wt cherry-status when any threshold trips (>100 behind, mid-rebase, cherry `-` only, identical-byte dirt across wts). Loud once per session, not on every prompt.

## Acceptance — docs

- Document the abort-broken-rebase recipe in `.claude/skills/worktree/SKILL.md`.
- Document the formatter-noise-across-worktrees pattern (`bun fix` runs locally and creates identical dirty bytes) so it stops looking like "real" WIP in audits.

## Provenance

Filed by `bjorn-session` on `@agent/3` after the 2026-05-08 cleanup pass. Same session also filed the related crash bead `@km/all/km-view-tree-sync-in-getter-hang` (P0). The dcg safety hook correctly blocked `git checkout HEAD -- <path>` and `git reset --hard` during this cleanup — those are the right defaults; the audit tool above should make the *need* for those operations rare.
