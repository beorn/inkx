---
mentions:
  - km
id: "@km/infra/worktree-hook-align"
aliases:
  - km-infra.worktree-hook-align
  - km-infra-worktree-hook-align
created_by: claude:2405c72e
created_at: 2026-04-28T22:19:43Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-infra.worktree-hook-align
    depends_on_id: km-infra
    type: parent-child
    created_at: 2026-04-28T15:19:43Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-infra
---

# [ ] Align worktree-create hook + isolate.sh with eventual-consistency convention @km/infra #task #P3

blocks:: [[@km/infra]]

Hook-side alignment for the eventual-consistency model. Lower-priority follow-up to @km/infra/max-skill-update-eventual-consistency and @km/infra/orphan-branch-audit.

## What to change

Review and adjust:

- `.claude/hooks/worktree-create.sh` — does it auto-create a branch? If yes, change naming to `wip/<bead-id>` (parsed from agent name or task description; else `wip/agent-<short-id>`).
- `.claude/lib/isolate.sh` — startup scaffolding only, probably no changes needed but verify.
- `.claude/hooks/worktree-remove.sh` (if exists) — currently auto-classifies on finish (preserve uncommitted/unique). Should still preserve, but with the new wip/<bead-id> naming convention. Should NOT push.

## Out of scope

The `/sop infra wip-triage` tool (@km/infra/orphan-branch-audit) is what walks the queue. This bead is just the hook-naming alignment.

## Reference

Memory: feedback-agent-isolation-eventual-consistency.md.

