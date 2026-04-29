---
id: "@km/_orphan/test-failures-0130"
aliases:
  - km-test-failures-0130
created_at: 2026-01-30T21:27:07Z
closed_at: 2026-01-30T21:47:07Z
---

# [x] Fix 8 failing tests (folding, move-mode, CLI resolution) @km/_orphan #bug #P1 @claude:3e1beaa0

## Failing Tests

### 1. km.test.md - CLI resolution
- `km tasks inbox` shows unexpected warning: 'Ambiguous resolution for inbox'

### 2. board.spec.ts - Folding (2 tests)
- `z toggles fold state on card with children`
- `folded card shows count indicator` - missing `▶ 2` indicator

### 3. move-mode-ui.test.ts - Move mode (4 tests)
- `[MOVE]` indicator not showing in status bar
- All 4 move-mode tests failing

### 4. columns-view.test.ts - Folding
- `folding works in columns view` - missing `▶ 2` indicator

## Root Causes
1. Folding UI - `▶ N` indicator not rendering
2. Move mode UI - `[MOVE]` not in status bar
3. CLI - 'inbox' has 2 matches now