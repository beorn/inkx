---
id: "@km/infra/worktree-clone-too-slow"
aliases:
  - km-infra.worktree-clone-too-slow
  - km-infra-worktree-clone-too-slow
created_by: claude:cd034ca4
created_at: 2026-04-26T21:47:24Z
closed_at: 2026-04-26T21:58:24Z
close_reason: fixed at 0b1c2bbf7
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-infra.worktree-clone-too-slow
    depends_on_id: km-infra
    type: parent-child
    created_at: 2026-04-26T14:47:24Z
    created_by: claude:cd034ca4
    metadata: "{}"
---

# [x] Worktree clone too slow → Hook cancelled by Claude Code harness @km/infra #bug #P2

blocks:: [[@km/infra]]

Persistent failure mode: agents dispatched with isolation:"worktree" intermittently fail with "WorktreeCreate hook failed: Hook cancelled". Reproduced multiple times in session 2026-04-26 cd034ca4.

## Root cause
- km repo is ~13G / ~500K files
- APFS `cp -c -R` clone is O(directory entries) — takes ~20-25s minimum even with copy-on-write data sharing
- isolate.sh serializes clones via `/tmp/silvery-clone.lock` — concurrent dispatches push 2nd clone to ~45-50s wall time
- Claude Code's hook execution ceiling is below this — second concurrent dispatch always cancelled, sometimes single dispatches too
- Hook log shows "creating clone at ..." but never "clone complete" for cancelled invocations

## Why repo is so big
- node_modules included in clone (silvery + km internal packages + vitest + vendor deps)
- vendor/ submodules: silvery, flexily, terminfo, vimonkey, vterm, claude-acp, bearly, etc.
- Plus normal source

## Options
1. **Prune node_modules from clone path** — exclude node_modules/, let clone target run `bun install` in background. Cuts clone size dramatically; pays cost on first `bun X` invocation in target.
2. **Audit + slim repo** — find what's contributing to 13G. `du -sh` on each subtree. Maybe vendor submodules have built artifacts that shouldn't be tracked.
3. **Raise hook ceiling** — file Claude Code feature request for longer hook timeout, or use detached-mode hook that signals async completion.
4. **Persistent shared worktree** — keep one .claude/worktrees/shared open; agents take turns. Dodges clone cost entirely.

## Acceptance
- Single agent dispatch with isolation:"worktree" succeeds reliably
- Two concurrent dispatches succeed reliably (or document expected serialization)
- Clone time documented and within Claude Code hook ceiling

## References
- Hook: .claude/hooks/worktree-create.sh
- Lib: .claude/lib/isolate.sh
- Earlier incident: 2026-04-24 lifecycle-scope agents cancelled (mentioned in isolate.sh comments)