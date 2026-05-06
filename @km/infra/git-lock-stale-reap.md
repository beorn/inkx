---
mentions:
  - km
  - claude
id: "@km/infra/git-lock-stale-reap"
aliases:
  - km-infra.git-lock-stale-reap
  - km-infra-git-lock-stale-reap
created_by: claude:51f52497
created_at: 2026-04-28T22:40:23Z
closed_at: 2026-04-28T22:52:53Z
close_reason: "Implemented + deployed: reapStaleLock() + LOCK_REAP_AGE_MS (1s
  race guard) in vendor/bearly/tools/lib/tribe/health-monitor-plugin.ts. Polling
  loop reaps holderless locks silently and logs to daemon log (not channels).
  Tests: 5 new in describe('reapStaleLock'), 103/103 health-monitor tests pass.
  Shipped: bearly main a4cb8e0, km main 4be7cb2eb, silvery main 3fa23479 (FF for
  pre-push hook). Daemon hot-reloaded — live now."
started_at: 2026-04-28T22:42:36Z
owner: bjorn@stabell.org
assignee: claude:51f52497
dependencies:
  - issue_id: km-infra.git-lock-stale-reap
    depends_on_id: km-infra
    type: parent-child
    created_at: 2026-04-28T15:40:26Z
    created_by: claude:51f52497
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-infra
---

# [x] Auto-reap stale .git/index.lock — silent, no warnings @km/infra #task #P2 @claude:51f52497

blocks:: [[@km/infra]]

## Problem

Tribe daemon currently emits noisy `health:git-lock:warning` messages when `.git/index.lock` persists >30s. Root cause: stale locks left by git processes killed mid-op (SubagentStop racing bd auto-commit, session /clear during git op, worktree create dying on submodule error, etc.).

The lock is real but the holder is gone. The warnings are visual noise — the right action is to just clean it up.

## Principle

`.git/index.lock` exists to coordinate concurrent git index writes. Git uses `open(O_CREAT|O_EXCL)` to acquire it; an active holder is always visible via `lsof`. **Any lock with no live holder is stale by definition** — there's no process to atomically rename it into place, so it serves no purpose.

The heuristic is simple: **no holder = reap it**. Size, content, ownership are all irrelevant.

## Race-condition guard

A sub-millisecond window exists between `open(O_EXCL)` succeeding and the kernel registering the FD visibly to `lsof`. A 1-2 second age threshold closes this race entirely:

- < 1s: too fresh, may be a healthy git op in flight
- ≥ 1s + no holder: stale, always safe to reap

## Design — silent auto-reap

```
poll every N seconds:
  if exists(.git/index.lock):
    if age >= 1s AND lsof shows no holder:
      rm -f .git/index.lock  # silent — no log, no channel message
    elif age >= 30s AND has holder:
      emit warning  # legitimate slow git op (lint hook, etc.)
    elif age >= 60s AND has holder:
      emit error  # genuinely stuck — investigate
```

Key change vs current behavior: no-holder case is silent reap, regardless of file size or age beyond the 1s race guard. Current daemon emits warnings on any 30s+ lock — the holder check is the actual signal.

## Out of scope (separate beads)

- Source-side fix: find which hooks kill git mid-op (likely SubagentStop racing bd auto-commit) — eliminates lock creation in the first place
- bd batched commits: reduce git-lock contention from rapid bead updates
- jj for branch ops: different concurrency model, sidesteps git lock for many ops

## /complete criteria

- Daemon source has the no-holder + age≥1s reap branch
- Manual test: create `.git/index.lock` (any size), observe reap within poll-interval + 1s, no channel message
- 24h soak: zero `health:git-lock:warning` messages for no-holder case (warnings only for genuine 30s+ holders)

## Implementation pointers

- Daemon source: search for "git-lock" or "index.lock" in `vendor/bearly/tools/tribe-daemon.ts` (or current location)
- Existing detection logic: keep `lsof` invocation; use exit code 1 = no holder
- Poll interval is fine — the 1s age guard handles per-poll race; tighter polling not required

