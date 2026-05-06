---
mentions:
  - km
id: "@km/tui1"
aliases:
  - km-tui1
  - "@km/_orphan/tui1"
created_at: 2026-01-16T23:44:46Z
closed_at: 2026-01-21T09:23:14Z
---

# [x] TUI1 Improvements Epic (Ink-based TUI) @km/tui1 #epic #P3

## TUI1 Improvements Epic (Ink-based TUI)

This epic tracks maintenance and improvement work for TUI1 (Ink-based), the production terminal UI.

**Status**: Active (TUI2 deferred per @km/tui-eval)  
**Location**: apps/@km/tui/packages/@km/_orphan/ink/

---

## Status (2026-01-17)

### ✅ COMPLETE

**Constraint Components** (@km/tui1/11-13):

- TruncatedText ✅
- FlexRow ✅
- ScrollableList ✅

**State Management Refactor**:

- UIContext with useSyncExternalStore ✅
- useUISelector with reselect memoization ✅
- Node folding moved to UIState ✅
- Legacy setters removed ✅

**Code Extractions**:

- TreeNode helpers to tree-node-helpers.ts ✅
- OverflowIndicator component ✅
- CardColumn.tsx extraction ✅

### ⏳ IN PROGRESS

**@km/tui1/1-decompose-board-tsx-2804-lines**: Decompose Board.tsx

- Was 2,804 lines → Now 2,521 lines (-283)
- Remaining: keyboard handlers, drag-drop logic

**@km/_orphan/96la**: Render layering (90% done)

- text/ layer complete ✅
- layout/ layer complete ✅
- render.ts still uses chalk directly ❌

### 📋 REMAINING

**Code Quality (P2)**:

- [ ] Extract keyboard handlers from Board.tsx
- [ ] Migrate render.ts to use renderRich
- [ ] Add tests for UIContext selectors

**Testing (P2)**:

- [ ] Add headless testing infrastructure (FORCE_TTY)
- [ ] Visual testing storybook setup

---

## Backlog (P3-P4)

- @km/tui1/5-improve-scroll-indicator-visibility: Improve scroll indicator visibility
- @km/tui1/6-due-date-urgency-colors: Due date urgency colors
- @km/tui1/9-mouse-support-improvements: Mouse support improvements
- @km/tui1/10-performance-optimization-for-large-trees: Performance optimization for large trees

---

## References

- [ADR 001](docs/adr/001-tui-architecture.md) - TUI architecture decision
- [ink-patterns.md](docs/dev/ink-patterns.md) - Ink workarounds guide

