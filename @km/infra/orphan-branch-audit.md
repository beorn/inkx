---
id: "@km/infra/orphan-branch-audit"
aliases:
  - km-infra.orphan-branch-audit
  - km-infra-orphan-branch-audit
created_by: claude:2405c72e
created_at: 2026-04-28T21:49:09Z
closed_at: 2026-04-28T22:32:48Z
close_reason: "Shipped wip-triage tool: bun tools/wip-triage.ts (525 LOC) +
  tools/wip-triage.test.ts (23 passing unit tests). Wired as SopTask in
  tools/sop-tools.ts; extended tools/sop.ts to accept 'sop scan|clean <domain>
  <task>' syntax. Live verification against km repo: surfaced 26 retained items
  (5 in-flight Wave 2 worktrees, this session's worktree, 1 bun-worktree, 19
  stashes). Auto-discardable gate correctly held back closed-bead worktree with
  ahead=2 commits (work-loss prevention). Branch
  wip/km-infra.orphan-branch-audit @ ae97d1c8a; worktree
  /Users/beorn/Code/pim/km/.claude/worktrees/agent-af96acf8b809eb84e.
  Out-of-scope items already filed:
  km-infra.max-skill-update-eventual-consistency (P2),
  km-infra.worktree-hook-align (P3)."
---

# [x] /sop infra check — orphan branches (no open bead) + stale worktrees (>24h idle) @km/infra #task #P1 @claude:2405c72e

blocks:: [[@km/infra]]

TRIAGE is the load-bearing primitive for agent isolation hygiene. There is no observable 'clean finish' — any actor (agent, parent session, hook, harness) can vanish without notice. The system is eventually consistent, not transactional. Branches + retained worktrees + stashes form a triage queue; the lead session walks the queue and decides per row.

Canonical operating doc: `feedback-agent-isolation-eventual-consistency.md` in the per-account memory directory. Read that before implementing.

## What to ship

A new tool: `bun tools/sop.ts scan|clean infra wip-triage` (also wired into `/sop infra` cadence).

### Inputs (sources of retained work)

1. `git worktree list --porcelain` — git-managed worktrees (incl. `.claude/worktrees/agent-*`)
2. `bun worktree list` — bun-named worktrees (e.g. `/Users/beorn/Code/pim/km-<name>`)
3. `git branch -a` minus origin/HEAD — local + remote branches
4. `git stash list` — stashes (often used for emergency-preserve)

### Per-row data

For each retained-work row, compute:

- Source kind: git-worktree / bun-worktree / branch-only / stash
- Linked bead (from branch name pattern `wip/<id>`, `bug/<id>`, `feat/<id>`, OR commit-message scan, OR stash message; `unknown` if none)
- Bead status (open / in_progress / closed / not-found)
- Last commit SHA + author + age (or stash creation time)
- Divergence: behind N / ahead M / N files changed vs main
- Worktree mtime (or stash age)
- Cheap test/lint status if applicable (skip for stashes — too expensive to apply+revert)

### Per-row actions

Three verbs, no others:

- **integrate** (`bun tools/sop.ts clean infra wip-triage --integrate <row-id>`):
  ```
  git fetch <worktree-path> <branch>:<branch>
  git merge --ff-only <branch>   # cherry-pick if non-FF
  git worktree remove --force <worktree-path>
  git branch -d <branch>
  ```
- **discard** (`--discard <row-id>`): `git worktree remove --force` + `git branch -D`. For stashes: `git stash drop <id>`.
- **leave** (do nothing): row stays in the queue for next pass. Triage tool does NOT spawn new agents — that's a separate decision.

### Stale flagging

Rows are highlighted as 'auto-discardable' ONLY when ALL of:
- Linked bead is closed
- No stash references the branch
- All commits reachable from origin/main (no unique work to lose)
- Worktree mtime >24h (or no worktree)

Otherwise: report as 'needs attention', do not auto-act.

### Cron mode

`bun tools/sop.ts scan infra wip-triage` — non-interactive scan, prints table + JSON summary, never deletes.

`bun tools/sop.ts clean infra wip-triage --auto-safe` — only discards rows that pass the auto-discardable gate above.

`bun tools/sop.ts clean infra wip-triage` (no flags) — interactive walker.

## Why P1 (revised from P2)

- Steady-state cost: every `/max` run creates 3-5 worktrees+branches; manual triage takes ~15-30 min per session.
- 2026-04-28 cleanup pass: 23 local + 15 remote merged branches + 14 stale worktrees removed in one pass — that's the debt this tool prevents from accumulating.
- L4 architectural primitive — eventual-consistency model depends on this triage layer existing.

Not P0 because manual cleanup works; P1 because building this is high-leverage infra investment.

## Acceptance

1. `bun tools/sop.ts scan infra wip-triage` prints a table with one row per retained-work item across all 4 sources (git-worktrees, bun-worktrees, branch-only, stashes); each row shows source kind, linked bead + status, divergence, age, action recommendation.
2. The interactive `clean` walker handles each verb correctly and is idempotent (re-running on a clean tree reports zero rows).
3. `--auto-safe` mode never deletes anything where work could be lost (stash referenced, unique commits, open bead).
4. Wired into `/sop infra` cadence so it surfaces a finding when there are >3 retained items OR any item on a closed bead older than 7 days.

## Out of scope (separate beads)

- Skill doc updates to drop push-to-origin contract from `.claude/skills/max/SKILL.md` and `.claude/skills/refactor/` — file as `km-infra.max-skill-update-eventual-consistency` (P2).
- Hook-side changes to `.claude/hooks/worktree-create.sh` / `.claude/lib/isolate.sh` to align with the convention (e.g. branch naming, no auto-push) — file as `km-infra.worktree-hook-align` (P3).

## Reference

- /big analysis 2026-04-28 evening (@km/session/0425-evening): integration vs recovery split, no-reliable-end-of-session, triage-is-the-primitive. Two refinement passes by user.
- Memory: `feedback-agent-isolation-eventual-consistency.md` (canonical operating doc).
- Closed sibling: `km-infra.agent-isolation-reframe` (the 'patch-apply' framing was scaffolding that didn't survive review — subsumed by this bead's integrate action).