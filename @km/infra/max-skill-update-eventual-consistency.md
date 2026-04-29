---
id: "@km/infra/max-skill-update-eventual-consistency"
aliases:
  - km-infra.max-skill-update-eventual-consistency
  - km-infra-max-skill-update-eventual-consistency
created_by: claude:2405c72e
created_at: 2026-04-28T22:19:43Z
closed_at: 2026-04-28T22:20:51Z
close_reason: "Updated .claude/skills/max/SKILL.md: replaced 'CRITICAL
  commit-AND-push' block with 'wip/<bead-id> local-only' contract. Anti-patterns
  table now flags the legacy mandate. /refactor skill had no push references.
  Committed direct to main."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-infra.max-skill-update-eventual-consistency
    depends_on_id: km-infra
    type: parent-child
    created_at: 2026-04-28T15:19:43Z
    created_by: claude:2405c72e
    metadata: "{}"
---

# [x] Drop push-to-origin contract from /max + /refactor skill docs (eventual-consistency model) @km/infra #task #P2

blocks:: [[@km/infra]]

Update `.claude/skills/max/SKILL.md` and `.claude/skills/refactor/` to align with the eventual-consistency model captured in `feedback-agent-isolation-eventual-consistency.md`.

## What to change

In the worktree-isolation prompt block currently mandated by /max:

CURRENT (the 'CRITICAL commit-AND-push' block):
- Mandates `git push origin <branch>`.
- Mandates `git ls-remote origin <branch>` SHA verification as proof of completion.
- Frames remote SHA as the deliverable.

NEW:
- Branch named `wip/<bead-id>` (consistent across all spawn sources).
- Commit incrementally to local branch only.
- **Do NOT push to origin.** Local branch is the deliverable.
- Final-message contract: report branch name, worktree path, local SHA from `git rev-parse HEAD`, files changed, tests added, self-verify output.
- Lead session triages and integrates via `git fetch <worktree-path> <branch>:<branch>` — see @km/infra/orphan-branch-audit.

## Files to edit

- `.claude/skills/max/SKILL.md` — replace the CRITICAL commit-AND-push block; update related guidance (Anti-Patterns table, etc.)
- `.claude/skills/refactor/` — any agent-spawning prompts there
- `.claude/skills/agent-team` if it exists

## Acceptance

- Grep for 'push origin' / 'ls-remote' in .claude/skills returns no results except in /git, /commit, or /release skills (those legitimately push).
- A new `/max` agent prompt (rendered) shows the new wip/<bead-id> + no-push contract.
- Existing in-flight agents from prior /max sessions are NOT re-prompted; they finish on the old contract.

## Why P2 (not P1 like the audit tool)

The convention can ship without the audit tool. The audit tool depends on the convention. Pre-audit-tool, manual triage works (we proved this 2026-04-28 by hand). Post-audit-tool, the convention saves the most leverage.

## Reference

Parent bead (the audit tool that consumes this convention): @km/infra/orphan-branch-audit.
Memory: feedback-agent-isolation-eventual-consistency.md.