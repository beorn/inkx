---
mentions:
  - km
  - Bjørn
---

# [x] Editor model (SlateJS-aligned) — tree ops carry cursor intent atomically @km/storage/tree #task #P2 @Bjørn Stabell

Board = Editor. Tree ops carry cursor intent atomically (SlateJS-aligned).

## Phase 1: Rename operations to SlateJS vocabulary

splitNode → split, mergeWithPrevious → mergeBackward, mergeWithNext → mergeForward,
addNode → insertNode, updateNode → setNode, deleteNode → removeNode,
getEditableText → KNode.string(), getPreviousSibling → KTree.previous,
getNextSibling → KTree.next, backspaceDegradation → degrade

## Phase 2: Atomic cursor

Board-level operations apply tree change + cursor update atomically.
block-ops return cursor intent, board ALWAYS applies it — no caller choice.
TEA effects model: operation → [treeEffects, cursorEffect]

## Phase 3: Auto-normalization

Schema enforcement after every operation (like SlateJS withNormalization).
canHaveChildren/canParent already exist in schema.ts — make them run automatically.

## Phase 4: Operation log

Record operations for undo/collaboration (aligns with event-sourcing).

Key differences from SlateJS to preserve:

- ID-based addressing (not path-based) — better for concurrent editing
- KNode data model (items, fstype, task_status) — richer than Slate elements
- Bidirectional markdown sync — SlateJS doesn't have this

