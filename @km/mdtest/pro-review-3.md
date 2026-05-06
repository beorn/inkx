---
mentions:
  - km
id: "@km/mdtest/pro-review-3"
aliases:
  - km-mdtest.pro-review-3
  - km-mdtest-pro-review-3
created_by: claude:65d845d9
created_at: 2026-03-14T00:12:29Z
closed_at: 2026-03-14T02:00:00Z
close_reason: All P0/P1 bugs fixed, 374 tests pass
owner: bjorn@stabell.org
---

# [x] Pro Review 3: mdtest — 8 P0, 3 P1, 2 P2 @km/mdtest #task #P2

GPT 5.4 Pro code review of mdtest (2026-03-13). Cost: $6.74. 13 findings total.

## P0 (correctness)

1. Built-in bash plugin hard-wired to Bun, breaks Vitest integration (plugins/bash.ts)
2. Internal blank lines in stdout/stderr silently removed (plugin-executor.ts:96-106)
3. Command extraction no longer follows Cram syntax, strips indentation (plugin-executor.ts:168-194)
4. Ellipsis matching loses captured placeholders (core.ts:212-218)
5. file= fixtures written to plugin stateDir instead of test cwd (plugins/bash.ts:17-30)
6. Bun integration runs lifecycle hooks per command step, not per block (integrations/bun.ts)
7. Vitest integration same per-step hook bug (integrations/vitest.ts)
8. Custom session mode reports exitCode=0 without OSC 133 markers (cmdSession.ts, ptySession.ts)

## P1 (safety/quality)

9. beforeAll only works when defined in first executed block (index.ts:318-323)
10. CLI hook cleanup not protected by finally (index.ts:287-427)
11. Temporary state directory is leaked (plugins/bash.ts)

## P2 (medium)

12. env= parsing truncates values containing = (core.ts:49-57)
13. parseFrontmatter() only handles tiny regex subset, silently misreads YAML (options.ts:8-42)

Full review: /tmp/llm-65d845d9-1773446149407-ob2w.txt

