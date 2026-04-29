---
id: "@km/review-arch/0-refactor-board-tsx-split-1210-line-monolithic-comp"
aliases:
  - km-review-arch.0
  - km-review-arch-0
  - "@km/review-arch/0"
created_at: 2026-01-23T09:11:23Z
closed_at: 2026-01-23T09:31:52Z
---

# [x] Refactor Board.tsx: split 1210-line monolithic component @km/review-arch #task #P2

## @km/review-arch/0-refactor-board-tsx-split-1210-line-monolithic-comp: Refactor Board.tsx

**Scope:** Split 1210 lines into 6 files (62% reduction in main file)

### New Structure
```
apps/km-tui/packages/km-ink/src/views/
├── Board.tsx          # Main orchestrator (450 lines)
├── board-input.ts     # Keyboard handlers (150 lines)
├── board-effects.ts   # Setup/lifecycle hooks (200 lines)
├── board-layout.ts    # Dimension calculations (150 lines)
├── board-top-bar.ts   # Path display (180 lines)
└── board-bottom-bar.ts # Status display (120 lines)
```

### Key Extractions
1. **board-input.ts** - useBoardKeyboardInput, useDetailPaneKeyboardInput
2. **board-effects.ts** - useSyncTerminalDimensions, useFileDropHandler, useMouseHandler, useRefreshHandler, useWatcherStatusHandler
3. **board-layout.ts** - computeBoardLayout, calcEdgeBasedColumnScrollOffset
4. **board-top-bar.ts** - getPathSegments, renderTopBarContent
5. **board-bottom-bar.ts** - BottomBar component

### Critical Dependencies to Preserve
- UI + Board state reducers stay in Board.tsx
- layoutRegistry ref must stay stable
- TUIContext built in Board.tsx after state computed