---
mentions:
  - km
id: "@km/cli/wave5-task-dep-integration"
aliases:
  - km-cli.wave5-task-dep-integration
  - km-cli-wave5-task-dep-integration
created_by: claude:f9eb64dc
created_at: 2026-05-05T23:18:00Z
type: task
priority: P2
status: todo
parent: km-cli
closeReason: "Cherry-picked 3 commits onto main: a17c956a2 (km-storage link
  infra) + 9b5e6f535 (tasks dep add/rm/ls) + 394805374 (compat tests). All 47
  new tests pass. Auto-merged tasks/index.ts and km-beads/bead.ts cleanly.
  Pushed at 9a8ef9d95. Memory entry updated to point at
  docs/design/model/klink.md."
---

# [x] Integrate Wave 5 (km link infra + tasks dep) feature branch into main @km/cli #task #P2

The Wave 5 agent (af597a34da13f4dbe) shipped 3 commits to `origin/feat/wave5-task-dep-links` instead of `origin/main` (worked in an isolated `.claude/worktrees/agent-af964ce873be7c779/` worktree, used the legacy feature-branch pattern). The work is preserved but not yet integrated.

## Commits to integrate

```
394805374 test(km-storage,km-cli): pin dep mutations + km-beads compatibility
9b5e6f535 feat(km-cli): tasks dep add/rm/ls subcommands
a17c956a2 feat(km-storage): internal km link infra (add/remove/get) backed by props-based blocked-by
```

Branch base: `c4b413b5e` (origin/main has since moved to `a1b8de5a0`).

## Files

- `packages/km-storage/src/links/edges.ts` (new — typed graph-edge dispatcher)
- `packages/km-storage/src/index.ts` (export `addGraphEdge` / `removeGraphEdge` / `getGraphEdges`)
- `apps/km-cli/src/commands/tasks/dep-plan.ts` (new — pure planner)
- `apps/km-cli/src/commands/tasks/dep.ts` (new — action handler)
- `apps/km-cli/src/commands/tasks/index.ts` (register dep subcommand)
- `packages/km-storage/tests/links/edges.test.ts` (new — 22 tests)
- `apps/km-cli/tests/tasks-dep-plan.test.ts` (new — 13 tests)
- `apps/km-cli/tests/tasks-dep.test.ts` (new — 11 tests)
- `packages/km-beads/src/bead.ts` (JSDoc note pointing new code at `addGraphEdge`)

## Integration approach

When working tree is clean (after bd-split agent commits):

```bash
git fetch origin
git cherry-pick a17c956a2 9b5e6f535 394805374
# Resolve any conflicts (only `tasks/index.ts` is likely; the rest are NEW files)
git push origin main
```

Or rebase the feature branch onto current main and merge --ff-only:

```bash
git fetch origin
cd .claude/worktrees/agent-af964ce873be7c779 2>/dev/null || true
# (the agent's worktree may still exist)
git rebase origin/main
git push origin feat/wave5-task-dep-links --force-with-lease
cd /Users/beorn/Code/pim/km
git merge --ff-only origin/feat/wave5-task-dep-links
git push origin main
```

## Drift surfaced (per agent report)

- Memory entry `project-storage-v5-progress.md` references `docs/design/links.md` but the canonical doc is at `docs/design/model/klink.md`. Update memory next time someone touches it.
- `Bead.addDependency` / `removeDependency` wrappers in `packages/km-beads/src/bead.ts` still use the old props-based path. They have a JSDoc note pointing new code at `addGraphEdge`. Refactoring to delegate would change their public signature; deferred until bd-split lands and `bd dep` becomes a thin wrapper around `tasks dep`.

## Acceptance

- [ ] All 3 Wave 5 commits land on `origin/main`
- [ ] `tasks dep add/rm/ls` work end-to-end
- [ ] All 46 new Wave 5 tests pass (22 edges.test.ts + 13 tasks-dep-plan + 11 tasks-dep)
- [ ] `bd dep` continues to work (compatibility pinned by `nodeToBead compat` tests in Wave 5's commits)
- [ ] Memory entry `project-storage-v5-progress.md` updated to point at `docs/design/model/klink.md`
- [ ] Close `@km/cli/task-bd-collapse` Wave 5 acceptance bullet via the integration commit message

## Why P2

The work is preserved on origin (not lost), but `tasks dep` is not user-accessible until merged. Once bd-split agent finishes, this integration is a 5-minute cherry-pick.

