---
id: "@km/infra/bd-integrate"
aliases:
  - km-infra.bd-integrate
  - km-infra-bd-integrate
created_by: claude:cc081a9a
created_at: 2026-04-28T07:59:27Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-infra.bd-integrate
    depends_on_id: km-infra
    type: parent-child
    created_at: 2026-04-28T00:59:34Z
    created_by: claude:cc081a9a
    metadata: "{}"
---

# [ ] bd integrate — single-command integration transaction (worktree → main → cleanup) @km/infra #feature #P1

blocks:: [[@km/infra]]

# bd integrate — design notes

## Why

Multi-agent integration is a recurring orchestration tax. Every closing session re-invents the arc: bead → branch → worktree → commit → push → merge → push-main → cleanup. Errors recur (un-pushed commits, orphan worktrees, WIP collisions, stray files).

Quality level: **L0** today (ad-hoc). Target: **L3** (API/lifecycle structure makes invalid state hard).

## Recurring incidents

- 2026-04-20 backdrop+themedetect: orphan commits + lying bead closure
- 2026-04-22 hook-router: dual agents on same submodule without isolation
- 2026-04-27 plateau-90: feedback-trace e0fc140c + C1 fossil-deletion 725ea161 committed but didn't push
- 2026-04-27 vendor merges (this session): bearly + silvery + km Phase 1-2-3 each required manual orchestration; main-worktree WIP triage; stray issues.jsonl; dcg permission tweak

## What `bd integrate <bead-id>` does

Single command, transactional. Each step is a hard gate; failure aborts and reports state.

1. **Pre-flight checks**
   - Bead exists and is `closed` OR `in_progress` with `--force`
   - Branch exists in worktree (read from bead metadata or `.claude/worktrees/<name>/`)
   - Worktree has no uncommitted changes
   - Branch is pushed to origin (verify via `git ls-remote origin <branch>`)
   - `/complete` criteria from bead description pass (run greps literally)
   - Main worktree has no uncommitted source changes (allow churn-listed paths only)

2. **Merge to main**
   - Fetch origin
   - Compute merge-base; abort if conflicts predicted
   - Fast-forward `--no-ff` merge with conventional message: `Merge bead <id>: <title>`
   - Push origin main
   - Verify push via `git ls-remote origin main` matches local SHA

3. **Bead state update**
   - New state: `integrated` (schema add)
   - Annotate with merge SHA and timestamp
   - `bd dolt push` so other sessions see the state

4. **Worktree cleanup** (tied to `integrated` state, NOT session end)
   - If worktree has no other branches: `git worktree remove`
   - If worktree has other beads in flight: keep, but unmark this branch
   - Skip if `--keep-worktree` flag set

5. **Optional: --batch mode**
   - `bd integrate --ready` integrates all beads matching state filter
   - Sequential, abort-on-first-failure

## Hard gates (anti-fail-modes)

| Gate | Catches | Implementation |
|------|---------|---------------|
| Branch pushed verify | un-pushed commits | `ls-remote` SHA match |
| Bead closure with evidence | aspirational closure | greps from `/complete` criteria |
| WIP gate on main | merge collisions | `git diff HEAD --name-only` filter |
| Push verify | local-only main | `ls-remote` match |
| Worktree-state gate | orphan worktrees | tied to `integrated` state |

## Schema

Add `integrated` to bead status enum (between `closed` and `archived`?). Or keep status as-is and add `integrated_at` + `merge_sha` columns. Latter is less disruptive — bead workflow stays `open → in_progress → closed`, integration is a separate dimension.

## First step (deliverable as standalone)

`bd integrate --dry-run <bead-id>` — read-only diagnostic. Prints "what would happen": branch state, push state, /complete grep results, conflict prediction, cleanup plan. No state mutation. Useful as a checklist tool before automation lands.

## Out of scope (for now)

- L4: making integration unforgeable by construction (would require restructuring how bd manages branches; too much for this bead)
- L5: deleting all manual orchestration paths (premature — ship L3 first, see what breaks)
- Multi-bead atomicity (integrate-all-or-rollback) — sequential abort-on-failure is sufficient for v1

## Acceptance / /complete criteria

- `bd integrate --dry-run <id>` works for any open or closed bead with a branch
- `bd integrate <id>` runs the full transaction with hard gates
- Each gate has a unit test for failure mode (simulated: un-pushed branch, WIP on main, missing /complete grep)
- Worktree cleanup happens iff bead reaches `integrated` state
- Bead schema migration is reversible
- `git ls-remote origin <branch>` is the single source of truth for "pushed" state (not local `git log`)
- Documentation: `.claude/skills/pm/workflows/integrate.md` (load when user says "integrate" / "ship" / "merge bead")

## Effort

1-2 days. Composing existing primitives (worktree-create.sh hook, bd CLI, beads schema, .claude/skills/complete state). No new infrastructure.

## Reference

- /big analysis: 2026-04-28 session, "how far from quality plateau"
- Hub quality rubric: hub/quality-rubric.md (L0-L5)
- feedback-worktree-shared-submodule.md (canonical 2-agent isolation rule)