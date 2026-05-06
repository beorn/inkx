---
mentions:
  - km
  - claude
id: "@km/vitestx/invariants"
aliases:
  - km-vitestx.invariants
  - km-vitestx-invariants
created_at: 2026-02-04T18:20:38Z
closed_at: 2026-02-04T18:27:46Z
assignee: claude:10db6ea8
---

# [x] Buffer stability & render invariants for TUI testing @km/vitestx #feature #P2 @claude:10db6ea8

Add toggleable invariants to catch buffer/rendering bugs:

1. **Buffer content stability**: After navigation (j/k), buffer content should NOT change (only cursor position/styling). Check: `expectBufferStable(before, after, { skipLines: [0, -1] })`
2. **Incremental vs fresh render mismatch**: Compare incremental buffer against fresh render. Catches caching/dirty-flag bugs. Check: `checkIncrementalRender(app)`

## Implementation

- Add `expectBufferStable()` to `apps/km-tui/src/test.ts`
- Add `checkIncrementalRender()` to inkx testing utilities
- Integration options: auto-check in press(), env var opt-in, or explicit in tests
- Add `test:strict` script with env vars enabled

## Motivation

@km/tui/level-nav-shift bug: k k causes card to disappear. Test harness buffer is correct but real terminal shows bug - indicates inkx diff rendering issue.

