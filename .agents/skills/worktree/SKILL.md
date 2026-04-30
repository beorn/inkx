---
description: "Worktree pool — claim a slot, work in it, release. The canonical source for all worktree/branch/concurrency/isolation rules. Load this before spawning agents, planning concurrent work, or asking 'where do I work?'."
argument-hint: "[claim | release | status | list]"
allowed-tools: Bash, Read
benefits-from: [beads, max, merge]
---

# Worktree — pool model + concurrency discipline

**Keywords**: worktree, pool, slot, wt1, wt2, claim, release, isolation, concurrent agents, branch hopping, parallel work

The single source of truth for worktree/branch/concurrency rules in this repo. Other skills (`/max`, `/merge`, `/refactor`, `/complete`) link here instead of duplicating.

## TL;DR

- **Main repo's working directory stays on `main`. Always.** No `git checkout <feature>` in the main repo.
- **Conflict-prone work goes in a pool slot.** 9 persistent slots: `.claude/worktrees/wt1`..`wt9`, each on stable branch `wtN`.
- **Lease bead `km-wtN` is the lock.** Claim → work → push → release. Bounded concurrency, visible contention via `km bd list`.
- **Localized changes in main are fine** for multiple agents on different files — no per-task branches needed.
- **Read-only / search / diagnosis agents always belong in main.**

## The pool

```
.claude/worktrees/wt1/    on branch wt1   ← lease bead km-wt1
.claude/worktrees/wt2/    on branch wt2   ← lease bead km-wt2
...
.claude/worktrees/wt9/    on branch wt9   ← lease bead km-wt9
```

Slots are **persistent** — never created/destroyed per task, always checked out, always present. Agents *move in*, do their work, *move out*; the slot persists for the next claim. The 9 slot beads are children of the `km-wt` epic.

## Claim → work → release protocol

```bash
# 1. Claim a free slot (try lowest open id)
km bd update km-wtN --claim
# (if assigned_to already set, slot is busy — pick another)

# 2. Move in
cd .claude/worktrees/wtN
git fetch origin
git rebase origin/main
git submodule update --recursive   # if vendor/ refs moved

# 3. Work
# ...edits, commits on branch wtN...
git commit -m "feat(scope): ..."   # conventional commits

# 4. Push (or have orchestrator cherry-pick)
git push origin wtN
# OR fast-forward main yourself if no contention + you have the lease:
#   cd <main-repo-root>
#   git merge --ff-only wtN
#   git push origin main

# 5. Move out — reset slot to clean baseline + release lease
cd .claude/worktrees/wtN
git fetch origin
git reset --hard origin/main
git submodule update --recursive
cd $(git rev-parse --show-toplevel)   # back to main repo
km bd close km-wtN --reason "shipped <main-tip-sha>"
```

The slot is now free for the next claim. Don't delete the directory or branch — recycle in place.

## When to use main vs. a pool slot

| Situation | Where |
|---|---|
| Read-only: search, diagnosis, planning, recall queries | Main |
| Localized writes: editing files in different packages, no overlap | Main (multiple agents OK) |
| Concurrent same-file edits, foundational changes (silvery, flexily, km-storage), submodule bumps | **Pool slot** |
| Long-running session work that needs its own state | Pool slot |
| Anything that needs `git checkout <branch>` | **Pool slot** (never `checkout` in main) |

## When to use `Agent({isolation: "worktree"})` (rare)

The default for /max should be: **claim a pool slot and spawn the agent into it**, not ephemeral isolation. Use `isolation: "worktree"` only when:

- All 9 pool slots are claimed (rare under normal workflow)
- You explicitly want a throwaway clone that auto-cleans up post-finish
- The work is so short-lived that pool churn isn't worth it (sub-second one-shots — but those usually don't need isolation at all)

The fallback uses APFS `cp -c -R` (~20-25s) and creates `.claude/worktrees/agent-<id>/` clones with auto-generated `wip/<bead-id>` branches. Per-agent branches pollute the branch namespace and create the silent HEAD-hop risk that motivated the pool model. **Prefer the pool.**

## Standing rules (enforce these)

1. **Never `git checkout <feature-branch>` in the main repo's working dir.** Not for a quick edit, not for "just to verify." The main repo working tree is on `main` — pull, edit, commit, push. The only exception is the orchestrator's consolidation phase (cherry-pick branches, push, delete).

2. **Multiple agents may operate in main concurrently** for *localized changes* — different files, different packages, no overlap. Read-only / search / diagnosis / planning agents always belong in main.

3. **Concurrent same-file or foundational work goes in pool slots.** Different slot per agent. Never two agents writing the same files in the same working tree.

4. **`isolation: "worktree"` for sub-agents stays available** for ephemeral one-shots and pool-overflow cases. Agents in those clones commit to `wip/<bead-id>` branches; lead integrates via cherry-pick. Branch is GC'd when the clone is removed.

5. **Verify isolation post-spawn** — `Agent({isolation: "worktree"})` can fail silently (lock contention, submodule failure). Check `git worktree list --porcelain` after spawn; fall back to claiming a pool slot if missing.

6. **Never `git stash` / `git reset --hard` / `git checkout <ref> -- <path>` against another agent's working tree.** If main repo's working dir has uncommitted files from another agent, ask the owner (broadcast on tribe) to commit or discard. Use `git show <ref>:<path> > <path>` for read-only retrieval. The reset-on-release inside a pool worktree is the only sanctioned destructive op, because the slot owns its branch.

7. **Cherry-picks beat merges for cross-worktree integration.** The orchestrator's consolidation phase cherry-picks each branch's commits onto main, resolving conflicts inline. Direct `git merge wtN main` from outside the worktree fragments history and risks submodule pointer mismatches.

8. **`cd "$(git rev-parse --show-toplevel)"` — never a hardcoded path.** When agents run inside a `.claude/worktrees/<agent>/` worktree, template substitutions for "the repo root" resolve to the *main repo's* path — Bash-tool calls then leak file writes back to main. Always derive the repo root at command time. (km-all.agent-worktree-isolation-cd-repo-root-leak)

9. **HARD RULE — 2+ agents on `vendor/<pkg>/`**: every agent MUST be in its own pool slot (or fallback worktree). Never two write-agents sharing a working tree on the same submodule. Silent corruption (orphaned commits, lying bead closure, sweep-up commits) — even with disjoint files, the discipline must hold.

## Spawning agents into pool slots (for /max)

When the lead spawns a write-agent in /max, the prompt must include:

> CRITICAL: You are in pool slot `.claude/worktrees/wtN/` on branch `wtN`. The slot was rebased on `origin/main` before you started.
> - Always `cd "$(git rev-parse --show-toplevel)"` — never hardcode paths.
> - Commit incrementally to branch `wtN` with conventional commits. **Do NOT** create a new feature branch.
> - **Do NOT push to origin** — the local branch is the deliverable; the lead session integrates via cherry-pick.
> - Final message MUST include: slot `wtN`, the worktree path, local SHA, files changed (absolute paths), tests added (paths + counts), self-verify output (actual `tsc --noEmit | grep "error TS" | wc -l` count, vitest pass/skip/fail breakdown — not assertions).
> - Do NOT close `km-wtN` yourself — that's the lead's job after integration.

## Integration is the lead's job

After a slot agent finishes:

```bash
cd "$(git rev-parse --show-toplevel)"   # main repo
git fetch .claude/worktrees/wtN wtN:wtN || true   # ensure tip is reachable
git cherry-pick <wtN-tip-sha>            # or git merge --ff-only wtN
# resolve conflicts inline if any
git push origin main

# Reset the slot
cd .claude/worktrees/wtN
git fetch origin
git reset --hard origin/main
git submodule update --recursive

# Release the lease
cd "$(git rev-parse --show-toplevel)"
km bd close km-wtN --reason "shipped <main-tip-sha>"
```

## Recovery — what to do if HEAD hops

Symptom: you started on `main`, now `git branch --show-current` says something else.

```bash
git checkout main         # back to main
git status                # check for stray uncommitted changes
# If commits accidentally landed on the wrong branch:
git log --oneline <wrong-branch>  # find the SHAs
git checkout main
git cherry-pick <each-SHA>        # replay onto main
```

Don't `git reset --hard` or `git stash` — preserve the work, replay it cleanly.

## Incident log

- **2026-04-29**: HEAD hopped from `main` to `bug/km-bearly.worktree-merge-origin-race-preflight` mid-cherry-pick. Recovered by checking out main and re-applying cherry-picks. Root cause: another session left a feature branch checked out in main repo's working dir.
- **2026-04-29 morning**: silvercode2 broadcast "branch hopped on me again" mid-write — main repo HEAD shifted from `feat/predicate-pre-map-filter` to `feat/km-tasks.blocked-filter` between read and write. Format-reflow commit accidentally swept up half-staged work from another agent.
- **2026-04-28 evening**: HEAD bounced through `feat/fuzz-migrate-roundtrip` → `feat/predicate-pre-map-filter` from concurrent agents committing to whatever was current.
- **2026-04-22 hook-router /max run**: 2 agents on vendor/bearly without isolation; worked only because they touched disjoint files. Discipline, not luck.
- **2026-04-20 backdrop+themedetect**: 2 agents on vendor/silvery without isolation → orphaned commits + lying bead closure.

The pool reframe: instead of "every agent makes a new worktree" (high spawn cost, conflict-prone branch proliferation) → "agents claim from a small persistent pool" (zero spawn cost, visible contention via `km bd list`, bounded resource).

## Pairs with

- `/beads` — the lease beads + canonical bead workflow
- `/max` — spawning concurrent agents (uses pool slots)
- `/merge` — drain WIP back to origin/main
- `/refactor` — phased refactors that may use multiple slots

## Anti-patterns

- `git checkout <feature>` in the main repo's working dir
- `Agent({isolation: "worktree"})` for routine work when a pool slot is free
- Per-task branches in the main repo (`feat/<bead-id>`, `wip/<thing>`) — pool slots use stable `wtN` names
- Mandating `git push origin` from sub-agents (the local branch IS the deliverable; lead integrates)
- Force-pushing or rebasing a pool slot's branch from outside the slot
- Cherry-picking a sub-agent's commits without first checking out main
- Hardcoded `cd /Users/beorn/Code/pim/km` in agent prompts — use `cd "$(git rev-parse --show-toplevel)"`
