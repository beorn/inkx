---
id: "@km/tui/shift-cursor"
aliases:
  - km-tui.shift-cursor
  - km-tui-shift-cursor
created_by: claude:d9855593
created_at: 2026-02-15T17:15:29Z
closed_at: 2026-02-15T18:26:49Z
---

# [x] TUI: column shift (Meta+l/Meta+h) moves cursor — should stay, shifting seems 'shifty' @km/tui #bug #P2

## Bug: Column shift (Meta+l/Meta+h) doesn't visually reorder columns

After Meta+l at a column header, the repo correctly swaps column sort orders, but the UI either doesn't re-render the new order or scrolls the target column off-screen.

### Root Causes (found on feat/virtual-columns branch)

**1. applyStructuralSharing missing reorder detection** (use-columns.ts)
- `applyStructuralSharing` compares prev/next column arrays for structural sharing
- When columns are swapped (Meta+l/Meta+h), their content doesn't change — only their ORDER
- The function checked `!anyColumnChanged && prev.length === next.length` and returned `prev` (old order)
- Missing: a loop comparing `prev[i].node.id !== next[i].node.id` to detect reordering
- Fix: Added order comparison loop before returning `prev`

**2. useVirtualization estimatedVisibleCount under-counts** (useVirtualization.ts)
- `Math.floor(viewportSize / (avgItemSize + gap))` rounds down aggressively
- With viewport=78, itemWidth=39, gap=1: floor(78/40)=1 but HVL renders 2 (boundary item included)
- Scroll algorithm thinks 1 visible → scrolls target column's neighbor off-screen after shift
- Fix: Changed to `Math.ceil` to match HVL's actual rendering behavior

**3. _layoutRepoVersion staleness check was removed** (board-app-store.ts)
- SELECT fast path didn't detect stale layout after repo mutation
- Fix: Restored the staleness check from main

### Test Verification
All 33 board-edit.spec tests pass after fixes.