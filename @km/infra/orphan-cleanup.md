---
mentions:
  - km
id: "@km/infra/orphan-cleanup"
aliases:
  - km-infra.orphan-cleanup
  - km-infra-orphan-cleanup
created_by: Bjørn Stabell
created_at: 2026-04-10T04:29:59Z
owner: bjorn@stabell.org
---

# [ ] Session-level orphan cleanup on account switch / rate limit @km/infra #task #P2

## Problem

When switching Claude Code accounts, all sessions simultaneously lose auth and retry, causing a 429 rate-limit storm. Rate-limited agents exit, but their child processes (vitest fork workers, tsc, etc.) survive as orphans at 100% CPU.

Found 2 orphaned vitest workers consuming 200% CPU for 6+ hours in 2026-04-09 session.

## Partial fix deployed

Vitest-specific: ppid polling in packages/@km/infra/vitest/setup.ts. Fork workers now detect when their parent dies (ppid changes to 1) and exit within 5 seconds.

## Broader fix needed

1. cmux should kill process trees on session end, not just the Claude Code process.
  - Use process groups: spawn Claude Code with setsid, kill -PGID on cleanup
  - Or: track all descendant PIDs and kill them explicitly
2. Claude Code SessionEnd hook should kill orphaned children:
  - In .claude/settings.json SessionEnd hook, add: pkill -P $$ || true
  - Or: kill the process group
3. tribe-daemon health monitor could detect and kill orphans:
  - It already tracks km processes
  - Add: detect bun/node with PPID=1 running >30min in km CWD → warn + offer to kill
  - Exclude: tribe-daemon itself (intentionally long-lived)
4. Rate limit handler: when Claude Code gets 429, it should SIGTERM all child processes before retrying or exiting, not just abandon them.

## Root cause

Account switches should be atomic — not "kill all, restart all." cmux could:

- Pause sessions (SIGSTOP) instead of killing
- Wait for natural completion of in-flight operations
- Resume with new auth token

But this is a cmux architecture change, not a quick fix.

