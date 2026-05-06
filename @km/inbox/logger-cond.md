---
mentions:
  - km
  - claude
id: "@km/inbox/logger-cond"
aliases:
  - km-logger-cond
  - "@km/_orphan/logger-cond"
created_at: 2026-02-02T11:12:16Z
closed_at: 2026-02-02T11:17:34Z
assignee: claude:3e1beaa0
---

# [x] Conditional logging with optional chaining for zero-cost disabled logs @km/_orphan #feature #P2 @claude:3e1beaa0

Add conditional logging wrapper that returns undefined for disabled log levels, enabling log.debug?.() pattern that skips argument evaluation entirely. Benchmark shows 22x speedup for expensive args.

