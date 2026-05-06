---
mentions:
  - km
id: "@km/inbox/z9hq"
aliases:
  - km-z9hq
  - "@km/_orphan/z9hq"
created_at: 2026-01-16T08:03:09Z
closed_at: 2026-01-16T08:13:05Z
---

# [x] TUI2 Full Visual Parity with TUI1 @km/_orphan #task #P1

## TUI2 Full Visual Parity with TUI1

TUI2 (OpenTUI) needs complete visual parity with TUI1 (Ink). Current issues identified:

## Known Issues

1. **Top bar looks vastly different** - Header component styling doesn't match TUI1
2. **Column headers have no styling** - Missing bold/color styling on column headers
3. **No borders on cards** - Cards missing box-drawing borders
4. **Padding differences** - Spacing around elements may differ

## Approach

1. Capture screenshots of TUI1 and TUI2 side-by-side
2. Compare each component:
  - Header/top bar
  - Column headers
  - Card rendering (borders, padding, colors)
  - Status bar/bottom bar
  - Selection highlighting
  - Status icons
3. Update TUI2 components to match TUI1 exactly

## Components to Compare

- Header.tsx
- Card.tsx
- Column.tsx
- StatusBar.tsx
- CardsView.tsx
- ListView.tsx
- ColumnsView.tsx

## Reference

- TUI1 design: apps/@km/_orphan/cli/src/tui/ (Board.tsx, TreeNode.tsx)
- Design system spec: specs/@km/design-system/md

