---
id: "@km/bearly/worktree-gc"
aliases:
  - km-bearly.worktree-gc
  - km-bearly-worktree-gc
created_by: claude:cc081a9a
created_at: 2026-04-27T15:34:14Z
---

# [ ] Worktree GC: sweep stale .claude/worktrees/agent-* clones @km/bearly #task #P3

blocks:: [[@km/bearly]]

Plateau-90 session ended with ~30 .claude/worktrees/agent-* clones accumulated. WorktreeRemove hook auto-classifies on agent finish (delete-if-clean, preserve-if-dirty), but preserved clones never get cleaned up. They accumulate over months. Some hold orphaned commits from agents that committed but didn't push (closed by /max CRITICAL block update). Proposed: scheduled sweep that audits .claude/worktrees/ — for each clone, check (a) is corresponding agent still active? (b) are all commits on origin? (c) age > N days? Action: stale + commits-on-origin = delete. Stale + commits-not-on-origin = warn user, list orphan SHAs. Wire into bearly's worktree tooling. Acceptance: command exists (e.g. bun worktree gc); runs in background or via /sop infra; ~30 backlog cleared after first run.