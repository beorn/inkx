---
mentions:
  - km
  - beorn
id: "@km/inbox/test-legacy"
aliases:
  - km-test-legacy
  - "@km/_orphan/test-legacy"
created_at: 2026-01-25T02:12:58Z
closed_at: 2026-01-25T02:31:56Z
assignee: beorn
---

# [x] Remove legacy handleKey() from tests @km/_orphan #task #P1 @beorn

## Problem

Tests use legacy `handleKey()` function (state.ts:632) which bypasses the real command system. This caused j/k navigation bug to slip through:

- Tests passed because they used working legacy code
- Real TUI failed because command system had broken cursor_up/cursor_down mapping
- See @km/_orphan/zlwa for the bug that this masked

## Solution

1. Update all board tests to use Board component with real command system
2. Remove `handleKey()` function from state.ts
3. Update test helper to use stdin.write() for all keyboard tests
4. Verify all tests still pass

## Files

- apps/@km/tui/src/state.ts (remove handleKey)
- apps/@km/tui/tests/helpers/board-test.ts (ensure uses Board not legacy path)

