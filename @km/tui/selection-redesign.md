---
id: "@km/tui/selection-redesign"
aliases:
  - km-tui.selection-redesign
  - km-tui-selection-redesign
created_by: Bjørn Stabell
created_at: 2026-04-03T17:07:50Z
closed_at: 2026-04-03T20:22:40Z
close_reason: Superseded by km-silvery.selection — design moved to
  @silvery/selection package level
owner: bjorn@stabell.org
---

# [x] Selection redesign: single value type + VisibleTree invariant @km/tui #task #P3

Replace ALL selection/cursor/edit state with a single Selection value type.

## The Unified Selection Type

Point = { nodeId: string, offset?: number }
  - offset absent → node cursor
  - offset present → text cursor (edit mode)

Selection =
  | { type: 'none' }
  | { type: 'caret', point: Point }                        // cursor (node or text)
  | { type: 'range', anchor: Point, focus: Point }         // contiguous range
  | { type: 'discrete', focus: Point, nodeIds: Set<string> } // cmd+click multi
  | { type: 'column', anchor: string, focus: string }      // column-level

## Source vs Derived

SOURCE (one value, stored in state):
  selection: Selection

DERIVED (pure functions, never stored):
  cursorNodeId = selection.focus.nodeId
  cursorCardId = ancestor(focus, 'card', tree)
  cursorColId = ancestor(focus, 'column', tree)
  selectionLevel = infer from type + depth
  isInTextMode = focus.offset !== undefined
  selectedNodeIds = derive(selection, visibleTree) → Set
  inlineEditBlock = { nodeId, blockIndex } when offset present

## What It Replaces
  - cursorNodeId (cursor-store.ts)
  - cursorCardNodeId, cursorColumnNodeId (cursor-store.ts)
  - selectionLevel (cursor-store.ts)
  - multiSelected: Set<string> (ui-reducer.ts)
  - selectionAnchor (ui-reducer.ts)
  - inlineEditBlock (ui-reducer.ts)
  - ReactiveNodeStore.multiSelected signals (reactive.ts)
  - expandWithDescendants (selection-engine.ts)

## Key Insight: offset IS edit mode
  { type: 'caret', point: { nodeId: 'task-1' } }           → node cursor
  { type: 'caret', point: { nodeId: 'task-1', offset: 0 } } → editing task-1
  No separate 'edit mode' flag needed.

## Invariant
  validateSelection(selection, visibleTree) → Selection
  - Invisible nodes → snap to nearest visible ancestor
  - Invalid offsets → clamp to content length
  - Run after every mutation

## Prior Art
  SlateJS: anchor/focus Points with path+offset (text-first)
  ProseMirror: abstract Selection validated against document (most rigorous)
  VS Code TreeView: anchor+focus with getRange (tree-first)
  km model: hybrid — tree-first with optional text offset

## Phases
  Phase 1: Define Selection type + pure functions in @km/tree, tests
  Phase 2: Wire into board-app-store, replace multiSelected + selectionAnchor + cursor
  Phase 3: Merge inlineEditBlock into Selection (offset = edit mode)
  Phase 4: Remove old state fields + ReactiveNodeStore.multiSelected