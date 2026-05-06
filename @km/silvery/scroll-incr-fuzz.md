---
mentions:
  - km
  - claude
id: "@km/silvery/scroll-incr-fuzz"
aliases:
  - km-silvery.scroll-incr-fuzz
  - km-silvery-scroll-incr-fuzz
created_by: claude:c9beade3
created_at: 2026-03-13T02:58:47Z
closed_at: 2026-03-13T17:05:07Z
close_reason: "Fixed: STRICT_OUTPUT exception corrupted prevBuffer by preventing
  pipeline return. Wrapped output phase in try/catch, attached content buffer to
  error. Regression test added. Fuzz pass rate: 0% to 79%. 9 remaining failures
  are separate real mismatches."
owner: bjorn@stabell.org
assignee: claude:c9beade3
---

# [x] Incremental rendering mismatch in scrolling boards (found by fuzz) @km/silvery #bug #P2 @claude:c9beade3

render-fuzz.fuzz.ts finds incremental rendering mismatches consistently in the scrolling fixture (80x16 terminal, 12+10+8 items across 3 columns). ALL seeds fail for all view modes (cards, columns, list).

## Repro

```bash
FUZZ=1 bun vitest run apps/km-tui/tests/render-fuzz.fuzz.ts
# All "scrolling / *" tests fail
```

## Root Cause (hypothesis)

Scroll container incremental rendering path — when columns have more items than fit in 16 rows, the scroll/overflow handling interacts with the incremental rendering cascade formulas incorrectly. The fresh render produces correct output but the incremental render diverges.

## Also Found

- Sporadic failures in large fixtures (100 items, 120x30) at certain seeds — likely same root cause
- Mutation keys (Enter/Escape for edit mode) trigger mismatches across all fixtures — may be a separate issue related to mode-change rendering

## Context

Found during @km/silvery/diagnostics-v2 implementation. These are pre-existing bugs, not regressions from the diagnostics work.

