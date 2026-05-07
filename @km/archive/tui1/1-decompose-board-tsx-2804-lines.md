---
mentions:
  - km
id: "@km/tui1/1-decompose-board-tsx-2804-lines"
aliases:
  - km-tui1.1
  - km-tui1-1
  - "@km/tui1/1"
created_at: 2026-01-16T23:45:55Z
closed_at: 2026-01-21T09:36:01Z
---

# [x] Decompose Board.tsx (2804 lines) @km/tui1 #task #P2

## Decompose Board.tsx

**Current size**: ~1,577 lines (down from 2,804 - significant progress!)

## Already Extracted

- TreeNode helpers → tree-node-helpers.ts ✅
- OverflowIndicator → component ✅
- CardColumn.tsx ✅
- UIContext with useSyncExternalStore ✅

## Remaining Opportunities

1. **Dialog Handlers** (~200 lines)
- Extract to use-board-dialogs.ts or expand existing
- ProjectPicker, NewItemDialog, HelpOverlay coordination
5. **Keyboard Logic** (~300 lines)
- Some keyboard handling still in Board.tsx
- Should route through @km/commands (see @km/cmd/migrate)
9. **Mouse/Paste/Drop Handlers** (~150 lines)
- Extract to separate adapter modules
12. **Effect Chains** (~100 lines)
- Multiple useEffect hooks managing different concerns
- Consider custom hooks for each concern

## Recommendation

Much of this will be addressed by @km/cmd/migrate (routing through @km/commands).
Focus on dialog extraction as independent work.

