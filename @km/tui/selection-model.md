---
id: "@km/tui/selection-model"
aliases:
  - km-tui.selection-model
  - km-tui-selection-model
created_by: claude:703e68be
created_at: 2026-02-11T13:10:57Z
closed_at: 2026-02-11T13:32:31Z
owner: bjorn@stabell.org
assignee: claude:703e68be
---

# [x] Selection model: Esc clears, Shift-H/L selects columns, coherent tree-selection @km/tui #feature #P2 @claude:703e68be

Three improvements to the multi-selection model:

## 1. Esc clears selection
Currently Esc routes to `close_or_quit` which cascades through overlays/modes but never checks `multiSelected`. There's a `clear_selection` command defined (selection.ts:70) mapped to Escape, but the keybinding (keybindings.ts:336) maps Escape to `close_or_quit` instead — making it unreachable.

**Fix**: Add selection clearing as a step in `handleCloseOrQuit()` cascade, before the final bell/boundary. If `multiSelected.size > 0`, clear it and return.

## 2. Shift-H/L selects columns
Currently Shift-H and Shift-L just clear selection (placeholder). They should select entire columns:
- Shift-L: select all cards in the column to the right (or extend column selection rightward)
- Shift-H: select all cards in the column to the left (or shrink/extend leftward)

## 3. Coherent tree-selection across depths (Decker model)
When selecting at different tree depths, the selection should normalize coherently:
- **Card-level** (Shift-J/K): individual card selection within a column (current behavior)
- **Column-level** (Shift-H/L): selects entire columns
- **Board-level** (Shift-A cycle): selects everything

Reference: Decker uses `removeNesting()` to ensure selection stays flat — no simultaneous parent-child selection. When you switch depths, selection normalizes to the new level. km should adopt a similar invariant: selecting at column level replaces card-level selections, and vice versa.

## Current state
- `ui.multiSelected: Set<SelectionKey>` tracks selected nodes
- `selectionAnchor` tracks range start for extend-select
- `selectAllLevel` cycles 0→1→2 (card→column→board)
- Shift-J/K work correctly for vertical card selection
- Shift-H/L are stubs that clear selection
- Esc doesn't check selection at all