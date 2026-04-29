---
id: "@km/tui/detail-focus"
aliases:
  - km-tui.detail-focus
  - km-tui-detail-focus
created_by: claude:53ab8041
created_at: 2026-02-28T09:21:18Z
closed_at: 2026-03-01T16:55:17Z
---

# [x] Detail pane: column-like focus, navigation, and selection highlighting @km/tui #feature #P1 @claude:53ab8041

## Problem

The detail pane doesn't behave like a proper focusable pane. When you move focus to it, there's no clear visual feedback about what's selected, navigation (j/k) doesn't work intuitively through the content sections, and properties aren't individually focusable. The unfocused pane also doesn't dim its selection state.

## Design: Column-Like Detail Pane

The detail pane should render **like a board column** — with the same focus/selection visual language:

### 1. Top Bar = Column Header

The top bar (currently via PaneBar) should behave like a column header:
- **When detail pane is focused**: top bar background = `$selected` (gold), text = `$selectedfg` (black) — just like a selected column header
- **When detail pane is NOT focused**: top bar uses current unfocused style (`$muted` bg, dimmed text)
- The "selected item" in the detail pane is the item itself by default (the top bar)

### 2. j/k Navigation Through Sections

When the detail pane is focused, j/k should move a cursor through focusable sections:
- **Top bar** (the item itself) — default selection
- **Each metadata property** (status, priority, due date, assigned, projects, tags, etc.)
- **Body content** (as a single block or per-block)
- **Subitems** (each subitem individually)
- **Backlinks** (each backlink individually)

This is the existing `detailCursorNodeId` system but extended to cover ALL sections, not just folder outline entries and backlinks.

### 3. Focusable Properties

Metadata properties should be individually selectable. When cursored:
- Highlighted with `$selected`/`$selectedfg` (same as a selected card)
- Enter could open an edit dialog for that property
- This enables keyboard-driven metadata editing

### 4. Dimming the Unfocused Pane

Whichever pane is NOT focused should dim its `$selected`/`$selectedbg`:
- **Board unfocused**: Already partially implemented — `borderDimColor={!boardFocused}` on cards
- **Detail pane unfocused**: Selection highlight should dim (use `dimColor` on the top bar and any cursored items)
- The key visual: you always know which pane is active by which one has bright gold vs dim gold

## Current State

- `DetailPane.tsx`: Has `isFocused` prop but uses it minimally
- `PaneBar.tsx`: Focused = `$border` bg, unfocused = `$muted` bg + dimColor — but NOT `$selected` (gold) like column headers
- `detailCursorNodeId`: Exists in store but only navigates folder outline (depth=0) and backlinks
- `CardColumn.tsx`: Has good selection/dimming patterns to replicate
- `board-pills.ts` `getHeaderStyle()`: Column header gold styling — detail pane should use the same pattern

## Implementation Approach

1. **Extend cursor model**: `detailCursorNodeId` → support section-based cursor (top-bar, meta:status, meta:priority, ..., body, subitem:id, backlink:id)
2. **PaneBar for detail**: When focused + cursor on top bar → gold background (like column header)
3. **Metadata rows**: Each row gets a focusable identity, cursor highlights with `$selected`
4. **Dim unfocused**: Both panes apply `dimColor` to their selection indicators when not focused
5. **Navigation commands**: Register j/k handlers for detail pane context (when detail focused)