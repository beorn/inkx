---
mentions:
  - km
  - claude
projects:
  - vertical
id: "@km/inkx/virtual-columns"
aliases:
  - km-inkx.virtual-columns
  - km-inkx-virtual-columns
created_by: claude:1cef7d9e
created_at: 2026-02-11T09:43:01Z
closed_at: 2026-02-15T18:26:51Z
owner: bjorn@stabell.org
assignee: claude:d9855593
---

# [x] VirtualColumns: framework-level horizontal+vertical virtualization with position tracking @km/inkx #feature #P3 @claude:d9855593

## Problem

Apps that render 2D grids of content (kanban boards, spreadsheets, dashboards) need two axes of virtualization:

1. **Horizontal**: only N columns visible at a time, off-screen columns don't render
2. **Vertical**: within each column, only visible items render (VirtualList)

Position tracking for cross-axis navigation (e.g., moving left/right to the same visual Y position) requires a registry of screen positions. When virtualization unmounts items, their registry entries must be cleaned up — otherwise stale entries corrupt position-based navigation.

Currently this is all app-level responsibility. This led to a stale registry entry bug in @km/tui where unmounted cards left stale positions that corrupted cross-column navigation.

## Proposal

A generic 2D virtualization component in inkx — no domain concepts (no 'columns', 'cards', 'boards'). Just:

1. **Horizontal virtualization**: render only visible sections of a horizontal axis (like VirtualList but horizontal)
2. **Vertical virtualization per section**: compose with VirtualList for vertical axis within each section
3. **Position registry**: generic position tracking keyed by (sectionIndex, itemIndex) with auto-register on mount, auto-unregister on unmount
4. **Cross-axis navigation helpers**: findItemAtY(sectionIndex, targetY), stickyY/stickyX management

The API should be axis-agnostic where possible — the same primitives work for horizontal columns, vertical sections, or grids.

## Prior Art

- **Flutter**: SliverGrid/SliverList with viewport-based recycling
- **React Native**: FlatList/SectionList with viewability tracking
- **Android**: RecyclerView with LayoutManager (GridLayoutManager, StaggeredGridLayoutManager)
- **iOS**: UICollectionView with compositional layout (sections + items)
- **Web**: react-virtualized FixedSizeGrid/VariableSizeGrid, TanStack Virtual (any-axis virtualizer)
- **Terminal**: blessed (no virtualization), bubbletea/ratatui (manual viewport), textual (virtual list only)

## Design Research

Deep research fired — see results when available. Key questions:

- Composable primitives (VirtualHorizontal + VirtualList) vs monolithic VirtualGrid?
- How to make position registry generic without domain concepts?
- API patterns from TanStack Virtual that translate to terminal?

## Current Code (@km/tui app layer — to be replaced)

- Board horizontal scroll: `apps/km-tui/src/views/Board.tsx:285` (`columns.slice`)
- Column scroll formula: `apps/km-tui/src/views/board-layout.ts` (`maxCols = floor(termWidth/35)`)
- VirtualList: `vendor/beorn-inkx/src/components/VirtualList.tsx`
- LayoutRegistry: `apps/km-tui/src/card-positions.ts`
- CardLayoutRegistrar: `apps/km-tui/src/views/CardColumn.tsx:74-122`

