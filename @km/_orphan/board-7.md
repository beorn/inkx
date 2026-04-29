---
id: "@km/_orphan/board-7"
aliases:
  - km-board-7
created_at: 2026-01-20T21:42:06Z
closed_at: 2026-02-04T11:27:25Z
---

# [x] Drag & drop (move cards/nodes) @km/_orphan #task #P4

## Phase 7: Drag & Drop (~4-6 hours)

**7.1 Detect Drag Start**
- On mouse-down, record potential drag target (node, column header, multi-selection)
- On mouse-move with button held, if distance > threshold, enter drag mode
- Visual feedback: dim original, show ghost/cursor indicator

**7.2 Drop Target Detection**
- Extend hit registry with `canAcceptDrop(dragSource)` callback
- During drag: highlight valid drop targets
- Column headers accept card drops (move to column)
- Nodes accept node drops (reparent as child/sibling)
- Space between nodes = insert position

**7.3 Drag Source Types**
```typescript
type DragSource =
  | { type: 'card'; colIndex: number; cardIndex: number }
  | { type: 'node'; nodeId: string; colIndex: number; cardIndex: number; subIndex: number }
  | { type: 'column'; colIndex: number }
  | { type: 'multi-selection'; keys: Set<string> };
```

**7.4 Drop Actions**
```typescript
if (dropTarget.type === 'column-header') {
  dispatchBoard({ type: 'MOVE_TO_COLUMN', cardIndex, targetColIndex });
}
if (dropTarget.type === 'node') {
  dispatchBoard({ type: 'REPARENT_NODE', nodeId, newParentId: dropTarget.nodeId });
}
if (dropTarget.type === 'insert-position') {
  dispatchBoard({ type: 'MOVE_NODE', nodeId, afterNodeId: dropTarget.afterNodeId });
}
```

**7.5 Visual Feedback**
- Ghost/cursor indicator follows mouse
- Valid drop targets highlight
- Insert position shows horizontal line

**7.6 Keyboard Modifiers**
- Shift: copy instead of move
- Escape: cancel drag

## Files
- `Board.tsx` - drag state machine
- `CardColumn.tsx` - drop target for column headers
- `TreeNode.tsx` - drop targets for nodes
- May need board-reducer changes for MOVE/REPARENT actions

## Verification
- Drag card to column header moves it
- Drag node to another node reparents it
- Drag to insert position reorders
- Escape cancels drag

## Depends on
- @km/_orphan/mouse-2 (hit registry)
- @km/_orphan/mouse-4 (drag mechanics from area select)