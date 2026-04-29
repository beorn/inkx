---
id: "@km/infra/git-lock-recovery"
aliases:
  - km-infra.git-lock-recovery
  - km-infra-git-lock-recovery
created_by: Bjørn Stabell
created_at: 2026-04-12T17:53:27Z
---

# [ ] Auto-recover stale git index.lock in multi-session environments @km/infra #task #P2

blocks:: [[@km/infra]]

Multiple Claude Code sessions running parallel git commands on the same repo cause frequent stale index.lock files. When a session's git command is interrupted (timeout, Escape, hook crash), the lock stays orphaned. Other sessions then fail until a human manually removes it.

## Current state
- Tribe health plugin detects stale locks and warns (10s, 39s thresholds)
- No auto-recovery — requires human intervention (`rm .git/index.lock`)
- No attribution — we can't tell which session created the lock
- Happens multiple times per day with 3+ concurrent sessions

## Proposed fix (tribe health plugin)
1. Attribution: `lsof .git/index.lock` → cross-reference PID with tribe session registry → broadcast 'lock held by km-7 (PID 12345) for 30s'
2. Auto-remove: if lock is 0 bytes + no holding process (lsof empty) + older than 60s → safe to rm. Broadcast 'removed stale git lock (0 bytes, no holder, 65s old)'
3. Blocked session recovery: when a session hits index.lock, broadcast 'blocked on git lock', wait 5s + retry. After 30s, ask health plugin to investigate
4. Prevention: sessions should sequence git commands (already in CLAUDE.md) but enforcement is weak

## Research needed
- Is there a way to avoid git locking altogether? (git worktrees per session? separate index files? libgit2 approaches?)
- Can git be configured with shorter lock timeouts?
- Do other multi-agent coding systems (Cursor, Windsurf, Codex) solve this differently?
- Would per-session git worktrees eliminate the shared-index problem entirely? (We have bun worktree but don't use it for every session)
- git's `core.fsmonitor` or `index.skipHash` — any relevance?

## Acceptance
- Stale locks auto-removed within 60s without human intervention
- Attribution shows which session caused the lock
- Zero false positives (never remove a lock that a live process holds)